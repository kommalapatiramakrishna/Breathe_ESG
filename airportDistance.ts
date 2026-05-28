// IATA code -> [lat, lon] for top ~60 business travel airports
const AIRPORTS: Record<string, [number, number]> = {
  JFK: [40.6413, -73.7781], LHR: [51.4700, -0.4543], CDG: [49.0097, 2.5479],
  LAX: [33.9425, -118.408], ORD: [41.9742, -87.9073], DFW: [32.8998, -97.0403],
  DEN: [39.8561, -104.6737], ATL: [33.6407, -84.4277], SFO: [37.6213, -122.379],
  SEA: [47.4502, -122.3088], MIA: [25.7959, -80.2870], BOS: [42.3656, -71.0096],
  IAD: [38.9531, -77.4565], EWR: [40.6895, -74.1745], IAH: [29.9902, -95.3368],
  PHX: [33.4373, -112.0078], MSP: [44.8848, -93.2223], DTW: [42.2162, -83.3554],
  PHL: [39.8729, -75.2437], CLT: [35.2140, -80.9431], LAS: [36.0840, -115.1537],
  MCO: [28.4312, -81.3081], SAN: [32.7338, -117.1933], BNA: [36.1245, -86.6782],
  AUS: [30.1975, -97.6664], HOU: [29.6454, -95.2789], SJC: [37.3626, -121.929],
  PDX: [45.5898, -122.5951], STL: [38.7487, -90.3700], MCI: [39.2976, -94.7139],
  FRA: [50.0379, 8.5622],  AMS: [52.3105, 4.7683],  MAD: [40.4936, -3.5668],
  BCN: [41.2971, 2.0785],  FCO: [41.8003, 12.2389], MUC: [48.3537, 11.7750],
  ZRH: [47.4647, 8.5492],  VIE: [48.1103, 16.5697], BRU: [50.9010, 4.4844],
  CPH: [55.6180, 12.6508], ARN: [59.6519, 17.9186], OSL: [60.1939, 11.1004],
  HEL: [60.3183, 24.9630], DUB: [53.4213, -6.2701], LIS: [38.7756, -9.1354],
  SIN: [1.3644, 103.9915], HKG: [22.3080, 113.9185], NRT: [35.7647, 140.3864],
  PEK: [40.0799, 116.6031], PVG: [31.1443, 121.8083], ICN: [37.4602, 126.4407],
  BKK: [13.6811, 100.7476], KUL: [2.7456, 101.7099], DEL: [28.5665, 77.1031],
  BOM: [19.0896, 72.8656], DXB: [25.2532, 55.3657], DOH: [25.2609, 51.6138],
  AUH: [24.4330, 54.6511], JNB: [26.1392, 28.2460], NBO: [1.3192, 36.9275],
  SYD: [-33.9399, 151.1753], MEL: [-37.6690, 144.8410], GRU: [-23.4356, -46.4731],
  BOG: [4.7016, -74.1469],  SCL: [-33.3930, -70.7858], LIM: [-12.0219, -77.1143],
  YYZ: [43.6772, -79.6306], YVR: [49.1967, -123.1815], MEX: [19.4363, -99.0721],
};

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function estimateFlightDistance(origin: string, destination: string): number | null {
  const o = AIRPORTS[origin.toUpperCase()];
  const d = AIRPORTS[destination.toUpperCase()];
  if (!o || !d) return null;
  return Math.round(haversineKm(o[0], o[1], d[0], d[1]));
}
