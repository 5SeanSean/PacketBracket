// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

// API endpoint that your frontend will call
app.post('/api/geolocation', async (req, res) => {
  try {
    const { ip } = req.body;
    
    // Validate the IP address
    if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
      return res.status(400).json({ error: 'Invalid IP address' });
    }

    const response = await axios.get(
      `https://api.ipgeolocation.io/ipgeo?apiKey=${process.env.GEO_API_KEY}&ip=${ip}`
    );
    
    // Transform the response to match your frontend expectations
    const transformedData = {
      country: response.data.country_name || 'Unknown',
      city: response.data.city || 'Unknown',
      region: response.data.state_prov || 'Unknown',
      isp: response.data.isp || 'Unknown',
      asn: response.data.asn || 'Unknown',
      latitude: parseFloat(response.data.latitude),
      longitude: parseFloat(response.data.longitude),
      mapUrl: response.data.latitude && response.data.longitude ? 
        `https://www.google.com/maps?q=${response.data.latitude},${response.data.longitude}` : null
    };
    
    res.json(transformedData);
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: 'Failed to fetch location' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});