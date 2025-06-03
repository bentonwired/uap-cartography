// flight_widget.js
(function(exports) {
  // ─── Shared state for your animation ───
  let animationPopup   = null;
  let animationInterval= null;
  let lastICAO         = null;
  let lastFeatures     = [];
  let currentPathCoords = [];
  let playPaused       = false;
  let animationEnded   = false;

  function initFlightWidget(map, geojsonUrl = './batch_flight_pings.geojson') {
  // 0) only run once
  if (map.getSource('flightPings')) return;

  // Flight pings source & layer
  map.addSource('flightPings', {type: 'geojson', data: { type: 'FeatureCollection', features: [] }});
  map.addLayer({id: 'flight-pings-layer', type: 'circle', source: 'flightPings', paint: {'circle-radius': 6, 'circle-color': '#FF5722'}});
  map.setLayoutProperty('flight-pings-layer', 'visibility', 'none');
  map.addSource('allFlightPaths', {type: 'geojson', data: { type: 'FeatureCollection', features: [] }});
  map.addLayer({id: 'all-flight-paths-layer', type: 'line', source: 'allFlightPaths', layout: {'line-join': 'round', 'line-cap': 'round'}, paint: {'line-width': 2, 'line-color': '#888'}});
  map.setLayoutProperty('all-flight-paths-layer', 'visibility', 'none');

      // Flight path source & layer
      map.addSource('flightPathLine', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      map.addLayer({
        id: 'flight-path-layer',
        type: 'line',
        source: 'flightPathLine',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-width': 3,
          'line-color': '#3b9ddd'
        }
      });
      map.setLayoutProperty('flight-path-layer', 'visibility', 'none');

      // Click handler: start or restart animation for selected ICAO
      map.on('click', 'flight-pings-layer', (e) => {
        const icao = e.features[0].properties.icao;
        startAnimationForICAO(icao);
      });
      // Change cursor to pointer when hovering over pings
      map.on('mouseenter', 'flight-pings-layer', () => {
      map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'flight-pings-layer', () => {
        map.getCanvas().style.cursor = '';
      });

    // Control buttons
    const loadBtn = document.getElementById('load-data-btn');
    const playPauseBtn = document.getElementById('play-pause-btn');
    const closeBtn = document.getElementById('close-btn');

    loadBtn.addEventListener('click', () => {
      // after you show the controls…
      controls.classList.add('bottom-center');
    });

    closeBtn.addEventListener('click', () => {
      // when you tear it down…
      controls.classList.remove('bottom-center');
    });

    //  ──  Disable both until we have data/selection ──
    playPauseBtn.disabled = true;
    closeBtn.disabled     = true;

    // ─── Replace only your existing loadBtn listener with this ───
    loadBtn.addEventListener('click', () => {
      // 1) Make sure a sighting has been selected
      const sightingId = window.currentSightingId;
      if (!sightingId) {
        console.error('No sighting selected for flight load.');
        return;
      }

      // 2) Normalize to Number if needed
      const idNum = (typeof sightingId === 'string' && !isNaN(sightingId))
        ? Number(sightingId)
        : sightingId;

      // 3) Pull the features array out of your cache (whether you stored it as an array or a FeatureCollection)
      const cache = window.flightDataCache;
      let featuresArr;
      if (Array.isArray(cache)) {
        featuresArr = cache;
      } else if (cache && Array.isArray(cache.features)) {
        featuresArr = cache.features;
      } else {
        console.error('flightDataCache is not loaded or invalid:', cache);
        return;
      }

      // 4) Filter only the pings for this sighting
      const filtered = featuresArr.filter(f => f.properties.sighting_id === idNum);
      if (!filtered.length) {
        console.warn(`No flight pings found for sighting ${idNum}`);
      }
      const data = { type: 'FeatureCollection', features: filtered };

      // 5) Update the ping-points layer
      map.getSource('flightPings').setData(data);
      map.setLayoutProperty(
        'flight-pings-layer',
        'visibility',
        filtered.length ? 'visible' : 'none'
      );

      // 6) Build & update the LineString paths
      const byIcao = filtered.reduce((acc, f) => {
        const ico = f.properties.icao;
        (acc[ico] = acc[ico] || []).push(f);
        return acc;
      }, {});
      const pathFeatures = Object.entries(byIcao).map(([icao, feats]) => ({
        type: 'Feature',
        properties: { icao },
        geometry: {
          type: 'LineString',
          coordinates: feats
            .sort((a, b) => a.properties.time - b.properties.time)
            .map(pt => pt.geometry.coordinates)
        }
      }));
      map.getSource('allFlightPaths').setData({
        type: 'FeatureCollection',
        features: pathFeatures
      });
      map.setLayoutProperty(
        'all-flight-paths-layer',
        'visibility',
        pathFeatures.length ? 'visible' : 'none'
      );

      // 7) Clear old popups & drop a new one at each flight’s first ping
      document.querySelectorAll('.mapboxgl-popup').forEach(p => p.remove());
      Object.values(byIcao).forEach(feats => {
        const first = feats.sort((a,b) => a.properties.time - b.properties.time)[0];
        const [lng, lat] = first.geometry.coordinates;
        const alt     = first.properties.alt_ft;
        const timeStr = new Date(first.properties.time * 1000).toLocaleString();

        new mapboxgl.Popup({ offset: 25 })
          .setLngLat([lng, lat])
          .setHTML(`
            <strong>${first.properties.icao}</strong><br/>
            Alt: ${alt} ft<br/>
            Time: ${timeStr}
          `)
          .addTo(map);
      });

      // 8) Enable the Close button now that flights are on the map
      closeBtn.disabled = false;
    });


    // Start or restart animation for a given ICAO
    function startAnimationForICAO(icao) {
      if (animationPopup) {
        animationPopup.remove();
        animationPopup = null;
      }
      lastICAO = icao;
      const allFeatures = map.getSource('flightPings')._data.features;
      lastFeatures = allFeatures
        .filter(f => f.properties.icao === icao)
        .sort((a, b) => a.properties.time - b.properties.time);

      if (animationInterval) clearInterval(animationInterval);
      animationInterval = null;
      currentPathCoords = [];
      playPaused = false;
      animationEnded = false;

      playPauseBtn.disabled   = false;
      playPauseBtn.textContent = 'Pause';
      map.setLayoutProperty('flight-path-layer', 'visibility', 'visible');
      map.getSource('flightPathLine').setData({ type: 'FeatureCollection', features: [] });

      let idx = 0;
      animationInterval = setInterval(() => {
        if (playPaused) return;
        if (idx >= lastFeatures.length) {
          clearInterval(animationInterval);
          animationInterval = null;
          animationEnded = true;
          playPauseBtn.textContent = 'Play';
          return;
        }
        currentPathCoords.push(lastFeatures[idx].geometry.coordinates);
        const lineGeoJSON = {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: currentPathCoords }
        };
        map.getSource('flightPathLine').setData({ type: 'FeatureCollection', features: [lineGeoJSON] });
        // ── NEW: move/create popup at this ping ──
        const feat = lastFeatures[idx];
        const [lng, lat] = feat.geometry.coordinates;
        const alt = feat.properties.alt_ft;  // your new field
        const timeStr = new Date(feat.properties.time * 1000).toLocaleString();

        if (!animationPopup) {
          animationPopup = new mapboxgl.Popup({ className: 'animation-popup', offset: 25 })
            .addTo(map);
        }
        animationPopup
          .setLngLat([lng, lat])
          .setHTML(`
            <strong>${feat.properties.icao}</strong><br/>
            Alt: ${alt} ft<br/>
            Time: ${timeStr}
          `);

        idx++;
      }, 1000);
    }

    // Play/Pause handler
    playPauseBtn.addEventListener('click', () => {
      if (!lastICAO) return;
      if (!animationInterval || animationEnded) {
        startAnimationForICAO(lastICAO);
        return;
      }
      playPaused = !playPaused;
      playPauseBtn.textContent = playPaused ? 'Play' : 'Pause';
    });

    // Close: clear everything
    closeBtn.addEventListener('click', () => {
       if (animationPopup) {
         animationPopup.remove();
         animationPopup = null;
       }
      if (animationInterval) clearInterval(animationInterval);
      animationInterval = null;
      map.getSource('flightPings').setData({ type: 'FeatureCollection', features: [] });
      map.getSource('flightPathLine').setData({ type: 'FeatureCollection', features: [] });
      map.setLayoutProperty('flight-pings-layer', 'visibility', 'none');
      map.setLayoutProperty('flight-path-layer', 'visibility', 'none');
      // ── also hide & clear the background tracks ──
      map.getSource('allFlightPaths').setData({ type: 'FeatureCollection', features: [] });
      map.setLayoutProperty('all-flight-paths-layer', 'visibility', 'none');
      // ── remove any lingering popups (initial + animation) ──
      document.querySelectorAll('.mapboxgl-popup').forEach(p => p.remove());

      playPauseBtn.disabled = true;
      closeBtn.disabled = true;
      playPauseBtn.textContent = 'Play';
      lastICAO = null;
      lastFeatures = [];
      currentPathCoords = [];

      // ←─ HERE: hide the entire controls overlay:
      document.getElementById('flight-controls-container').style.display = 'none';
    });
  }
  // expose the plugin API
  exports.initFlightWidget = initFlightWidget;
})(window);
