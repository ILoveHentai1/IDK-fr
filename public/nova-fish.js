(() => {
  const $ = id => document.getElementById(id);
  const DEFAULT = [42.3601, -71.0589];
  const state = {
    pos: DEFAULT,
    map: null,
    marker: null,
    tile: null,
    species: localStorage.getItem('novaFishSpecies') || 'Striped Bass',
    spots: JSON.parse(localStorage.getItem('novaFishSpots') || '[]'),
    searchTimer: null,
    fishData: null
  };

  state.map = L.map('map', { zoomControl:false }).setView(DEFAULT, 12);
  L.control.zoom({ position:'bottomright' }).addTo(state.map);

  function setLayer(mode){
    if(state.tile) state.tile.remove();
    state.tile = mode === 'satellite'
      ? L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {maxZoom:19, attribution:'Tiles © Esri'})
      : L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19, attribution:'© OpenStreetMap'});
    state.tile.addTo(state.map);
    document.querySelectorAll('.mapTools button').forEach(b => b.classList.toggle('active', b.dataset.layer===mode));
  }
  setLayer('street');

  const fishIcon = L.divIcon({
    className:'',
    iconSize:[44,44],
    iconAnchor:[22,22],
    html:'<div style="width:44px;height:44px;border-radius:50%;display:grid;place-items:center;background:#072232e8;border:2px solid #59dbff;box-shadow:0 5px 18px #0009;font-size:24px">🎣</div>'
  });
  state.marker = L.marker(DEFAULT,{icon:fishIcon}).addTo(state.map);

  $('species').value = state.species;
  $('species').addEventListener('change', e => {
    state.species = e.target.value;
    localStorage.setItem('novaFishSpecies', state.species);
    refreshFish();
  });

  function fmt(v,d=0){ return Number.isFinite(Number(v)) ? Number(v).toFixed(d) : 'N/A'; }

  function lureSuggestion(species, data){
    const sp = species.toLowerCase();
    const wind = Number(data?.weather?.wind_speed_10m||0);
    const cloud = Number(data?.weather?.cloud_cover||0);
    if(sp.includes('striped')) return wind>12 ? '5–7" paddletail or bucktail' : 'SP Minnow, topwater, or paddletail';
    if(sp.includes('blue')) return 'Metal jig, pencil popper, or durable minnow plug';
    if(sp.includes('fluke')) return 'Bucktail + Gulp, worked close to bottom';
    if(sp.includes('largemouth')) return cloud>50 ? 'Spinnerbait / chatterbait' : 'Worm / jig / swimbait';
    if(sp.includes('smallmouth')) return 'Tube, ned rig, jerkbait, or small swimbait';
    if(sp.includes('trout')) return 'Small spoon, inline spinner, or natural bait';
    return 'Match local forage with a versatile swimbait';
  }

  async function refreshFish(){
    $('status').textContent='Loading conditions…';
    try{
      const [weather, marine] = await Promise.all([
        fetch(`https://api.open-meteo.com/v1/forecast?latitude=${state.pos[0]}&longitude=${state.pos[1]}&current=temperature_2m,precipitation,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m&hourly=cloud_cover,pressure_msl,wind_speed_10m,precipitation&forecast_days=2&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`).then(r=>r.json()),
        fetch(`https://marine-api.open-meteo.com/v1/marine?latitude=${state.pos[0]}&longitude=${state.pos[1]}&current=wave_height,sea_surface_temperature,ocean_current_velocity,ocean_current_direction,sea_level_height_msl&hourly=wave_height,sea_surface_temperature,ocean_current_velocity,ocean_current_direction,sea_level_height_msl&forecast_days=2&temperature_unit=fahrenheit&length_unit=imperial&timezone=auto`).then(r=>r.json()).catch(()=>({}))
      ]);
      const w = weather.current || {};
      const m = marine.current || {};
      const hour = new Date().getHours();
      const lowLight = (hour<=8 || hour>=17) ? 18 : 6;
      const wind = Number(w.wind_speed_10m||0);
      const cloud = Number(w.cloud_cover||0);
      const pressure = Number(w.pressure_msl||1013);
      const current = Number(m.ocean_current_velocity||0);
      const wave = Number(m.wave_height||0);
      const sst = Number(m.sea_surface_temperature||0);

      let speciesAdj=0;
      const sp=state.species.toLowerCase();
      if(sp.includes('striped')) speciesAdj=(sst>=50&&sst<=70?12:0)+(current>.25?8:0);
      else if(sp.includes('blue')) speciesAdj=(sst>=55&&sst<=75?10:0)+(current>.3?7:0);
      else if(sp.includes('fluke')) speciesAdj=(sst>=58&&sst<=75?10:0)+(wave<4?5:0);
      else if(sp.includes('largemouth')) speciesAdj=(Number(w.temperature_2m)>=55&&Number(w.temperature_2m)<=85?10:0);
      else speciesAdj=6;

      const windScore=wind>=4&&wind<=18?12:wind<25?6:0;
      const cloudScore=cloud>=35?8:3;
      const pressureScore=pressure>=1005&&pressure<=1020?8:4;
      const currentScore=current>.15&&current<2?10:4;
      const waveScore=wave>=.5&&wave<=5?8:3;
      const rainPenalty=Number(w.precipitation||0)>.25?-5:0;
      let score=Math.round(35+lowLight+windScore+cloudScore+pressureScore+currentScore+waveScore+speciesAdj+rainPenalty);
      score=Math.max(12,Math.min(98,score));

      const windows=[];
      const now=new Date();
      for(let i=0;i<12;i++){
        const t=new Date(now.getTime()+i*3600000);
        const h=t.getHours();
        let s=score+(h<=8||h>=17?8:-2);
        windows.push({time:t,score:Math.max(10,Math.min(99,s))});
      }
      windows.sort((a,b)=>b.score-a.score);
      state.fishData={weather:w,marine:m,score,best:windows[0]};

      $('biteScore').textContent=score;
      $('bestWindow').textContent=windows[0].time.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
      $('confidence').textContent=`${windows[0].score}/100 predicted · experimental`;
      $('waterTemp').textContent=m.sea_surface_temperature!=null?`${fmt(m.sea_surface_temperature)}°F`:'N/A';
      $('waves').textContent=m.wave_height!=null?`${fmt(m.wave_height,1)} ft`:'N/A';
      $('current').textContent=m.ocean_current_velocity!=null?`${fmt(m.ocean_current_velocity,1)} mph`:'N/A';
      $('tide').textContent=m.sea_level_height_msl!=null?`${fmt(m.sea_level_height_msl,2)} ft`:'N/A';
      $('wind').textContent=w.wind_speed_10m!=null?`${fmt(w.wind_speed_10m)} mph`:'--';
      $('pressure').textContent=w.pressure_msl!=null?`${fmt(w.pressure_msl)} hPa`:'--';
      $('throwSuggestion').textContent=lureSuggestion(state.species,state.fishData);
      $('updated').textContent=`Updated ${new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}`;
      $('status').textContent='Conditions updated';
    }catch(err){
      $('status').textContent=`Error: ${err.message}`;
    }
  }

  function saveSpot(){
    const spot={id:Date.now(),lat:state.pos[0],lng:state.pos[1],species:state.species,score:state.fishData?.score||null,date:new Date().toLocaleString()};
    state.spots=[spot,...state.spots].slice(0,50);
    localStorage.setItem('novaFishSpots',JSON.stringify(state.spots));
    renderSpots();
    $('status').textContent='Spot saved';
  }

  function renderSpots(){
    $('spotCount').textContent=state.spots.length;
    if(!state.spots.length){
      $('savedSpots').innerHTML='<div class="empty">No saved spots yet.</div>';
      return;
    }
    $('savedSpots').innerHTML=state.spots.slice(0,12).map(s=>`
      <div class="spot">
        <button style="all:unset;cursor:pointer;flex:1" data-fly="${s.id}">
          <span><strong>📍 ${s.species}</strong><small>${s.score?`${s.score}/100 · `:''}${s.date}</small></span>
        </button>
        <button class="delete" data-del="${s.id}">×</button>
      </div>`).join('');
    document.querySelectorAll('[data-fly]').forEach(b=>b.onclick=()=>{
      const s=state.spots.find(x=>x.id===Number(b.dataset.fly));
      if(s) state.map.flyTo([s.lat,s.lng],16);
    });
    document.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{
      state.spots=state.spots.filter(x=>x.id!==Number(b.dataset.del));
      localStorage.setItem('novaFishSpots',JSON.stringify(state.spots));
      renderSpots();
    });
  }

  function updateGPS(p){
    state.pos=[p.coords.latitude,p.coords.longitude];
    state.marker.setLatLng(state.pos);
    $('status').textContent=`GPS ±${Math.round(p.coords.accuracy)}m`;
  }

  if(navigator.geolocation){
    navigator.geolocation.watchPosition(updateGPS, e=>$('status').textContent=e.message, {enableHighAccuracy:true,maximumAge:1000,timeout:10000});
  }

  $('gpsBtn').onclick=()=>state.map.flyTo(state.pos,15);
  $('refreshBtn').onclick=refreshFish;
  $('saveSpotBtn').onclick=saveSpot;
  document.querySelectorAll('.mapTools button').forEach(b=>b.onclick=()=>setLayer(b.dataset.layer));

  $('searchInput').addEventListener('input', e=>{
    clearTimeout(state.searchTimer);
    const q=e.target.value.trim();
    if(q.length<3){$('suggestions').classList.add('hidden');return;}
    state.searchTimer=setTimeout(async()=>{
      try{
        const data=await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=6&q=${encodeURIComponent(q)}`).then(r=>r.json());
        $('suggestions').innerHTML=data.map((s,i)=>`<button data-place="${i}"><strong>${s.name||s.display_name.split(',')[0]}</strong><small>${s.display_name}</small></button>`).join('');
        $('suggestions').classList.toggle('hidden',!data.length);
        document.querySelectorAll('[data-place]').forEach(btn=>btn.onclick=()=>{
          const s=data[Number(btn.dataset.place)];
          state.map.flyTo([Number(s.lat),Number(s.lon)],14);
          $('searchInput').value=s.display_name;
          $('suggestions').classList.add('hidden');
        });
      }catch{}
    },350);
  });

  $('searchForm').onsubmit=e=>{
    e.preventDefault();
    const first=document.querySelector('[data-place]');
    if(first) first.click();
  };

  renderSpots();
})();