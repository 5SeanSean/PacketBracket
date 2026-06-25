#!/usr/bin/env python3
"""
PacketBracket Live Capture Daemon
Sniffs packets and streams them to the React app via WebSocket.

Requirements:
    pip install -r requirements-capture.txt

Usage:
    python capture_daemon.py [--interface <iface>] [--port 8765]
"""

import asyncio
import json
import argparse
import logging
import socket
import struct
from datetime import datetime

try:
    import websockets
except ImportError:
    raise SystemExit("Missing dependency: pip install websockets")

try:
    from scapy.all import sniff, IP, TCP, UDP, ICMP, DNS, conf
    SCAPY_AVAILABLE = True
except ImportError:
    SCAPY_AVAILABLE = False

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("packetbracket")

# Shared set of connected WebSocket clients
clients: set = set()


def is_private_ip(ip: str) -> bool:
    try:
        packed = struct.unpack("!I", socket.inet_aton(ip))[0]
    except OSError:
        return True
    private_ranges = [
        (0x0A000000, 0xFF000000),  # 10.0.0.0/8
        (0xAC100000, 0xFFF00000),  # 172.16.0.0/12
        (0xC0A80000, 0xFFFF0000),  # 192.168.0.0/16
        (0x7F000000, 0xFF000000),  # 127.0.0.0/8
        (0xA9FE0000, 0xFFFF0000),  # 169.254.0.0/16
        (0x00000000, 0xFFFFFFFF),  # 0.0.0.0
    ]
    for network, mask in private_ranges:
        if packed & mask == network & mask:
            return True
    return False


def get_protocol(packet) -> str:
    if packet.haslayer(TCP):
        return "TCP"
    if packet.haslayer(UDP):
        return "UDP"
    if packet.haslayer(ICMP):
        return "ICMP"
    return "OTHER"


def packet_to_event(packet) -> dict | None:
    if not packet.haslayer(IP):
        return None

    src = packet[IP].src
    dst = packet[IP].dst

    # Skip if both endpoints are private (local-only traffic)
    if is_private_ip(src) and is_private_ip(dst):
        return None

    return {
        "type": "packet",
        "src": src,
        "dst": dst,
        "protocol": get_protocol(packet),
        "size": len(packet),
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "src_private": is_private_ip(src),
        "dst_private": is_private_ip(dst),
    }


async def broadcast(event: dict):
    if not clients:
        return
    message = json.dumps(event)
    # Fire-and-forget to all connected clients
    await asyncio.gather(*[ws.send(message) for ws in list(clients)], return_exceptions=True)


def scapy_callback(packet):
    event = packet_to_event(packet)
    if event:
        asyncio.run_coroutine_threadsafe(broadcast(event), loop)


async def handler(websocket):
    clients.add(websocket)
    log.info("Client connected (%d total)", len(clients))
    try:
        await websocket.send(json.dumps({"type": "connected", "message": "PacketBracket daemon ready"}))
        # Consume incoming messages to keep the connection alive (websockets 14+ API)
        async for _ in websocket:
            pass
    except Exception as e:
        log.debug("Handler closed: %s", e)
    finally:
        clients.discard(websocket)
        log.info("Client disconnected (%d remaining)", len(clients))


async def serve(port: int):
    async with websockets.serve(handler, "localhost", port):
        log.info("WebSocket server listening on ws://localhost:%d", port)
        await asyncio.Future()  # run forever


def start_sniffer(interface: str | None):
    import threading
    import platform

    def _sniff():
        kwargs = {"prn": scapy_callback, "store": False}
        if interface:
            kwargs["iface"] = interface
        log.info("Starting packet capture on %s", interface or "default interface")
        try:
            sniff(**kwargs)
        except RuntimeError as e:
            if "winpcap" in str(e).lower() or "npcap" in str(e).lower() or "layer 2" in str(e).lower():
                log.warning("Layer 2 capture unavailable — falling back to layer 3 (install Npcap for full capture)")
                try:
                    from scapy.all import conf, L3socket
                    kwargs["opened_socket"] = conf.L3socket()
                    sniff(**kwargs)
                except Exception as e2:
                    log.error("Layer 3 fallback also failed: %s", e2)
                    if platform.system() == "Windows":
                        log.error("Install Npcap from https://npcap.com to enable packet capture on Windows")
                    asyncio.run_coroutine_threadsafe(
                        broadcast({"type": "no_capture", "message": "Install Npcap from https://npcap.com to enable live capture on Windows"}),
                        loop
                    )
            else:
                log.error("Sniffer error: %s", e)

    t = threading.Thread(target=_sniff, daemon=True)
    t.start()


async def main(interface: str | None, port: int):
    if not SCAPY_AVAILABLE:
        raise SystemExit("scapy is not installed. Run: pip install scapy")

    log.info("PacketBracket live capture daemon starting")
    log.info("Open http://localhost:3000 in your browser")

    start_sniffer(interface)
    await serve(port)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="PacketBracket live capture daemon")
    parser.add_argument("--interface", "-i", default=None, help="Network interface to capture on")
    parser.add_argument("--port", "-p", type=int, default=8765, help="WebSocket port (default: 8765)")
    args = parser.parse_args()

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    try:
        loop.run_until_complete(main(args.interface, args.port))
    except KeyboardInterrupt:
        log.info("Shutting down")
