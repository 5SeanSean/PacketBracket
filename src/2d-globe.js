;(() => {
  let chart;
  let root;
  let pointSeries;
  let currentMarkers = [];
  let selectedMarker = null;
  let hoveredMarker = null;
  let isZoomedIn = false;

  // Initialize empty 2D globe on site load
  function initEmpty2DGlobe() {
    console.log("Initializing empty 2D globe with AmCharts...");

    const container = document.getElementById("globe");
    
    // Create chart container
    const chartDiv = document.createElement("div");
    chartDiv.id = "amchart-map";
    chartDiv.style.width = "100%";
    chartDiv.style.height = "100%";
    chartDiv.style.position = "absolute";
    chartDiv.style.top = "0";
    chartDiv.style.left = "0";
    chartDiv.style.display = "none"; // Hidden by default
    container.appendChild(chartDiv);

    // Initialize chart
    initializeAmChart();
  }

  // Initialize AmChart
  function initializeAmChart() {
    // Create root element
    root = am5.Root.new("amchart-map");

    // Set themes
    root.setThemes([
      am5themes_Animated.new(root)
    ]);

    // Create the map chart with zoom control and padding
    chart = root.container.children.push(am5map.MapChart.new(root, {
      projection: am5map.geoMercator(),
      panX: "translateX",
      panY: "translateY",
      wheelX: "zoomX",
      wheelY: "zoomY",
      maxZoomLevel: 64,
      minZoomLevel: 1,
      zoomLevel: 1.5,
      homeZoomLevel: 1.5,
      homeGeoPoint: { longitude: 0, latitude: 0 },
      paddingTop: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      paddingRight: 0
    }));

    // Enable inertia for smoother panning
    chart.set("interactionsEnabled", true);
    chart.set("mouseWheelBehavior", "zoom");

    // Create series for background fill
    var backgroundSeries = chart.series.push(am5map.MapPolygonSeries.new(root, {}));
    backgroundSeries.mapPolygons.template.setAll({
      fill: am5.color(0x0d0208),
      fillOpacity: 0.1,
      stroke: am5.color(0x00ff41),
      strokeOpacity: 0.2
    });

    // Add background polygon
    backgroundSeries.data.push({
      geometry: am5map.getGeoRectangle(90, 180, -90, -180)
    });

    // Create main polygon series for countries
    var polygonSeries = chart.series.push(am5map.MapPolygonSeries.new(root, {
      geoJSON: am5geodata_worldLow
    }));
    
    polygonSeries.mapPolygons.template.setAll({
      fill: am5.color(0x0d0208),
      fillOpacity: 0.2,
      stroke: am5.color(0x00ff41),
      strokeOpacity: 0.3
    });

    // Add graticule (grid lines)
    var graticuleSeries = chart.series.push(am5map.GraticuleSeries.new(root, {}));
    graticuleSeries.mapLines.template.setAll({
      stroke: am5.color(0x00ff41),
      strokeOpacity: 0.08
    });

    // Create point series for markers
    pointSeries = chart.series.push(am5map.MapPointSeries.new(root, {}));

    // Configure marker template
    pointSeries.bullets.push(function() {
      var circle = am5.Circle.new(root, {
        radius: 5,
        tooltipY: 0,
        fill: am5.color(0x00ff41),
        stroke: am5.color(0x0d0208),
        strokeWidth: 2,
        cursorOverStyle: "pointer"
      });

      // Add hover state
      circle.states.create("hover", {
        radius: 7,
        fill: am5.color(0x64ffda)
      });

      // Add selected state
      circle.states.create("selected", {
        radius: 8,
        fill: am5.color(0x64ffda)
      });

      // Handle click events
      circle.events.on("click", function(ev) {
        const dataItem = ev.target.dataItem;
        selectMarker(dataItem);
      });

      // Handle pointerover events
      circle.events.on("pointerover", function(ev) {
        const dataItem = ev.target.dataItem;
        hoveredMarker = dataItem;
        updateTooltip(dataItem);
      });

      // Handle pointerout events
      circle.events.on("pointerout", function() {
        hoveredMarker = null;
        updateTooltip(null);
      });

      return am5.Bullet.new(root, {
        sprite: circle
      });
    });

    // Center the map and set initial zoom
    chart.appear(1000, 100).then(function() {
      chart.zoomToGeoPoint({ longitude: 0, latitude: 0 }, 1.5, true);
    });

    console.log("AmCharts 2D globe initialized successfully");
  }
  // Populate 2D globe with IP data
  function populate2DGlobe(ipData, ipPackets) {
    console.log("Populating 2D globe with IP data:", ipData);

    // Store references to the data for tooltips
    window.currentIPData = ipData;
    window.currentIPPackets = ipPackets;

    // Clear existing data
    clear2DGlobeData();

    // Filter out invalid coordinates
    const validIPs = ipData.filter((ip) => {
      return !isNaN(ip.latitude) && !isNaN(ip.longitude);
    });

    if (validIPs.length === 0) {
      showStatus("No valid geolocation data available", "error");
      return;
    }

    // Add markers to the map
    validIPs.forEach(ip => {
      const packets = window.currentIPPackets?.get(ip.ip);
      const count = packets ? packets.incoming.length + packets.outgoing.length : 0;
      
      const threatColor = ip.threatLevel?.color || "#00ff41";
      
      const dataItem = pointSeries.pushDataItem({
        latitude: ip.latitude,
        longitude: ip.longitude,
        ip: ip.ip,
        city: ip.city,
        country: ip.country,
        count: count,
        threatLevel: ip.threatLevel || { color: "#00ff41", name: "Safe" },
        fillColor: am5.color(threatColor)
      });

      currentMarkers.push(dataItem);
    });

    console.log("2D globe populated with data successfully");
  }

  // Clear all IP data from 2D globe
  function clear2DGlobeData() {
    pointSeries.data.clear();
    currentMarkers = [];
    selectedMarker = null;
    hoveredMarker = null;
    
    // Clear global references
    window.currentIPData = null;
    window.currentIPPackets = null;
  }

  // Show/hide 2D globe
  function show2DGlobe() {
    const chartDiv = document.getElementById("amchart-map");
    if (chartDiv) {
      chartDiv.style.display = "block";
    }
  }

  function hide2DGlobe() {
    const chartDiv = document.getElementById("amchart-map");
    if (chartDiv) {
      chartDiv.style.display = "none";
    }
  }

  // Select a marker
  function selectMarker(dataItem) {
    if (selectedMarker === dataItem) return;
    
    deselectMarker();
    selectedMarker = dataItem;
    
    // Set selected state
    if (dataItem.bullet) {
      dataItem.bullet.get("sprite").set("selected", true);
    }
    
    // Highlight in side panel
    if (window.highlightIPInSidePanel) {
      window.highlightIPInSidePanel(dataItem.get("ip"));
    }
    
    // Update tooltip
    updateTooltip(dataItem);
  }

  // Deselect marker
  function deselectMarker() {
    if (selectedMarker) {
      // Clear selected state
      if (selectedMarker.bullet) {
        selectedMarker.bullet.get("sprite").set("selected", false);
      }
      
      // Deselect in side panel
      if (window.highlightIPInSidePanel) {
        window.highlightIPInSidePanel(null);
      }
      
      selectedMarker = null;
    }
  }

  // Update tooltip content
  function updateTooltip(dataItem) {
    if (!dataItem) {
      pointSeries.set("tooltip", undefined);
      return;
    }
    
    const ip = dataItem.get("ip");
    const city = dataItem.get("city") || "Unknown";
    const country = dataItem.get("country") || "Unknown";
    const count = dataItem.get("count") || 0;
    const threatLevel = dataItem.get("threatLevel") || { name: "Safe", color: "#00ff41" };
    
    const ipInfo = window.currentIPData?.find((data) => data.ip === ip);
    
    const tooltipContent = [
      `${city}, ${country}`,
      `IP: ${ip}`,
      `Threat: ${threatLevel.name}`,
      `Packets: ${count}`,
      ipInfo?.isp ? `ISP: ${ipInfo.isp}` : null
    ].filter(line => line !== null).join("\n");
    
    pointSeries.set("tooltip", am5.Tooltip.new(root, {
      labelText: tooltipContent,
      themeTags: ["tooltip"],
      pointerOrientation: "vertical",
      autoTextColor: false,
      labelHTML: `
        <div style="
          background: #0d0208;
          color: #00ff41;
          padding: 8px;
          border: 1px solid #00ff41;
          border-radius: 4px;
          font-family: 'Courier New', monospace;
          font-size: 12px;
          white-space: pre-line;
        ">
          ${tooltipContent}
        </div>
      `
    }));
  }

  function showStatus(message, type = "info") {
    const statusEl = document.createElement("div");
    statusEl.style.position = "fixed";
    statusEl.style.bottom = "20px";
    statusEl.style.right = "20px";
    statusEl.style.padding = "10px 20px";
    statusEl.style.borderRadius = "5px";
    statusEl.style.color = "white";
    statusEl.style.zIndex = "1000";

    if (type === "error") {
      statusEl.style.backgroundColor = "rgba(255, 82, 82, 0.9)";
    } else {
      statusEl.style.backgroundColor = "rgba(100, 255, 218, 0.9)";
    }

    statusEl.textContent = message;
    document.body.appendChild(statusEl);

    setTimeout(() => {
      statusEl.style.opacity = "0";
      setTimeout(() => {
        document.body.removeChild(statusEl);
      }, 500);
    }, 3000);
  }

  function cleanup2DGlobe() {
    if (root) {
      root.dispose();
    }
    
    const container = document.getElementById("globe");
    const chartDiv = document.getElementById("amchart-map");
    if (container && chartDiv) {
      container.removeChild(chartDiv);
    }
    
    currentMarkers = [];
    selectedMarker = null;
    hoveredMarker = null;
  }

  window.initEmpty2DGlobe = initEmpty2DGlobe;
  window.populate2DGlobe = populate2DGlobe;
  window.clear2DGlobeData = clear2DGlobeData;
  window.show2DGlobe = show2DGlobe;
  window.hide2DGlobe = hide2DGlobe;
  window.cleanup2DGlobe = cleanup2DGlobe;
})();