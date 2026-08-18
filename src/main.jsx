import React,{useEffect,useRef,useState} from 'react';
import ReactDOM from 'react-dom/client';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import {createClient} from '@supabase/supabase-js';

const SUPABASE_URL='https://qecdozfvzctwqykmamtr.supabase.co';
const SUPABASE_KEY='sb_publishable_mfVT80cEN9D-I-Gd1CGADQ_diq_FvFj';
const supabase=createClient(SUPABASE_URL,SUPABASE_KEY);
const HISTORY_KEY='gtiNavDriveHistory';

function App(){
 const mapEl=useRef(null),map=useRef(null),marker=useRef(null),others=useRef(new Map()),channel=useRef(null),baseLayer=useRef(null);
 const prev=useRef(null),line=useRef(null),route=useRef(null),searchTimer=useRef(null),driverId=useRef(crypto.randomUUID());
 const [pos,setPos]=useState([42.3601,-71.0589]),[speed,setSpeed]=useState(0),[heading,setHeading]=useState(0);
 const [room,setRoom]=useState(''),[name,setName]=useState(localStorage.getItem('gtiNavName')||'Driver');
 const [dest,setDest]=useState(''),[suggestions,setSuggestions]=useState([]),[searching,setSearching]=useState(false);
 const [status,setStatus]=useState('Waiting for GPS'),[tracking,setTracking]=useState(false),[activeTab,setActiveTab]=useState('drive');
 const [drivePoints,setDrivePoints]=useState([]),[convoyLive,setConvoyLive]=useState(false);
 const [mapMode,setMapMode]=useState(localStorage.getItem('gtiMapMode')||'street'),[routeMode,setRouteMode]=useState(localStorage.getItem('gtiRouteMode')||'fastest'),[carModel,setCarModel]=useState(localStorage.getItem('gtiCarModel')||'MK6'),[carColor,setCarColor]=useState(localStorage.getItem('gtiCarColor')||'silver');
 const [history,setHistory]=useState(()=>{try{return JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]')}catch{return []}});
 const [stats,setStats]=useState({start:0,top:0,avg:0,count:0,dist:0});
 const [appMode,setAppMode]=useState(localStorage.getItem('gtiAppMode')||'drive');
 const [fishSpecies,setFishSpecies]=useState(localStorage.getItem('novaFishSpecies')||'Striped Bass');
 const [fishData,setFishData]=useState(null),[fishLoading,setFishLoading]=useState(false),[fishUpdated,setFishUpdated]=useState(0);
 const [savedFishSpots,setSavedFishSpots]=useState(()=>{try{return JSON.parse(localStorage.getItem('novaFishSpots')||'[]')}catch{return []}});


 const icon=(n,m,h,other=false,model=carModel,color=carColor)=>L.divIcon({className:'',iconSize:[76,66],iconAnchor:[38,50],html:`<div class="car ${other?'other':''} color-${color}"><div class="tag">${n} · ${Math.round(m)} MPH</div><div class="modelTag">${model}</div><img src="./gti.svg" style="transform:rotate(${h||0}deg)"></div>`});

 useEffect(()=>{map.current=L.map(mapEl.current,{zoomControl:false}).setView(pos,15);baseLayer.current=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map.current);L.control.zoom({position:'bottomright'}).addTo(map.current);marker.current=L.marker(pos,{icon:icon('YOU',0,0,false,carModel,carColor)}).addTo(map.current);setTimeout(()=>map.current.invalidateSize(),100)},[]);

 function changeMapMode(mode){if(!map.current)return;baseLayer.current?.remove();if(mode==='satellite'||mode==='hybrid'){baseLayer.current=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'Tiles © Esri'}).addTo(map.current)}else{baseLayer.current=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map.current)}setMapMode(mode);localStorage.setItem('gtiMapMode',mode)}
 useEffect(()=>{if(map.current)changeMapMode(mapMode)},[]);
 useEffect(()=>{localStorage.setItem('gtiCarModel',carModel);localStorage.setItem('gtiCarColor',carColor);marker.current?.setIcon(icon('YOU',speed,heading,false,carModel,carColor))},[carModel,carColor]);

 useEffect(()=>{if(!navigator.geolocation){setStatus('GPS unavailable');return}const id=navigator.geolocation.watchPosition(p=>{const n=[p.coords.latitude,p.coords.longitude],mph=Math.max(0,(p.coords.speed||0)*2.236936),hd=Number.isFinite(p.coords.heading)?p.coords.heading:heading;setPos(n);setSpeed(mph);setHeading(hd);setStatus(`GPS ±${Math.round(p.coords.accuracy)}m`);marker.current?.setLatLng(n).setIcon(icon('YOU',mph,hd));
 if(tracking){if(prev.current){const d=L.latLng(prev.current).distanceTo(L.latLng(n))/1609.344;setStats(s=>({...s,dist:s.dist+d,top:Math.max(s.top,mph),avg:(s.avg*s.count+mph)/(s.count+1),count:s.count+1}))}prev.current=n;setDrivePoints(v=>[...v,{lat:n[0],lng:n[1],speed:mph,time:Date.now()}]);if(!line.current)line.current=L.polyline([],{weight:5}).addTo(map.current);line.current.addLatLng(n)}
 if(channel.current&&room)channel.current.send({type:'broadcast',event:'telemetry',payload:{id:driverId.current,name,lat:n[0],lng:n[1],speed:mph,heading:hd,model:carModel,color:carColor,ts:Date.now()}})},e=>setStatus(e.message),{enableHighAccuracy:true,maximumAge:1000});return()=>navigator.geolocation.clearWatch(id)},[tracking,room,name,heading]);

 useEffect(()=>{clearTimeout(searchTimer.current);const q=dest.trim();if(q.length<3){setSuggestions([]);return}searchTimer.current=setTimeout(async()=>{try{setSearching(true);const g=await fetch(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=6&q=${encodeURIComponent(q)}`).then(r=>r.json());setSuggestions(g)}catch{setSuggestions([])}finally{setSearching(false)}},350);return()=>clearTimeout(searchTimer.current)},[dest]);

 async function routeToPlace(place){try{setSuggestions([]);setDest(place.display_name||dest);setStatus('Routing…');const d=[+place.lat,+place.lon],r=await fetch(`https://router.project-osrm.org/route/v1/driving/${pos[1]},${pos[0]};${d[1]},${d[0]}?overview=full&geometries=geojson&steps=true&alternatives=3`).then(r=>r.json());if(!r.routes?.length)throw Error('No route');let choices=[...r.routes];let chosen=choices[0];if(routeMode==='shortest')chosen=choices.sort((a,b)=>a.distance-b.distance)[0];if(routeMode==='curvy')chosen=choices.sort((a,b)=>(b.distance/b.duration)-(a.distance/a.duration))[0]||choices[0];route.current?.remove();route.current=L.geoJSON(chosen.geometry,{style:{weight:7}}).addTo(map.current);map.current.fitBounds(route.current.getBounds(),{padding:[30,30]});const label=routeMode==='curvy'?'Curvy beta':routeMode[0].toUpperCase()+routeMode.slice(1);setStatus(`${label} · ${(chosen.distance/1609.344).toFixed(1)} mi · ${Math.round(chosen.duration/60)} min`)}catch(err){setStatus(err.message)}}
 async function go(e){e.preventDefault();if(suggestions[0])return routeToPlace(suggestions[0]);try{const g=await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(dest)}`).then(r=>r.json());if(!g[0])throw Error('Destination not found');routeToPlace(g[0])}catch(err){setStatus(err.message)}}

 async function join(code=room){code=code.trim().toUpperCase();if(!code)return;localStorage.setItem('gtiNavName',name);if(channel.current)await supabase.removeChannel(channel.current);for(const [,m] of others.current)m.remove();others.current.clear();setRoom(code);setConvoyLive(false);const ch=supabase.channel(`convoy:${code}`,{config:{broadcast:{self:false}}});channel.current=ch;
 ch.on('broadcast',{event:'telemetry'},({payload:d})=>{if(!d||d.id===driverId.current||!d.lat)return;let m=others.current.get(d.id);if(!m){m=L.marker([d.lat,d.lng],{icon:icon(d.name,d.speed,d.heading,true,d.model||'GTI',d.color||'silver')}).addTo(map.current);others.current.set(d.id,m)}else m.setLatLng([d.lat,d.lng]).setIcon(icon(d.name,d.speed,d.heading,true,d.model||'GTI',d.color||'silver'))});
 ch.on('broadcast',{event:'hello'},({payload:d})=>{if(!d||d.id===driverId.current)return;ch.send({type:'broadcast',event:'telemetry',payload:{id:driverId.current,name,lat:pos[0],lng:pos[1],speed,heading,model:carModel,color:carColor,ts:Date.now()}})});
 ch.subscribe(async state=>{if(state==='SUBSCRIBED'){setConvoyLive(true);setStatus(`Convoy ${code} live`);await ch.send({type:'broadcast',event:'hello',payload:{id:driverId.current,name}});await ch.send({type:'broadcast',event:'telemetry',payload:{id:driverId.current,name,lat:pos[0],lng:pos[1],speed,heading,model:carModel,color:carColor,ts:Date.now()}})}if(state==='CHANNEL_ERROR'||state==='TIMED_OUT'){setConvoyLive(false);setStatus('Convoy connection failed')}})}
 function create(){join(Math.random().toString(36).slice(2,8).toUpperCase())}
 async function leave(){if(channel.current)await supabase.removeChannel(channel.current);channel.current=null;for(const [,m] of others.current)m.remove();others.current.clear();setConvoyLive(false);setRoom('');setStatus('Left convoy')}

 function drive(){if(!tracking){setStats({start:Date.now(),top:0,avg:0,count:0,dist:0});setDrivePoints([]);prev.current=null;line.current?.remove();line.current=null;setTracking(true);setActiveTab('drive')}else{const ended=Date.now(),trip={id:ended,started:stats.start,ended,distance:stats.dist,top:stats.top,avg:stats.avg,duration:Math.max(0,ended-stats.start),points:drivePoints};const next=[trip,...history].slice(0,50);setHistory(next);localStorage.setItem(HISTORY_KEY,JSON.stringify(next));setTracking(false);setActiveTab('history')}}
 function openTrip(t){route.current?.remove();if(!t.points?.length){setStatus('No route saved for this drive');return}route.current=L.polyline(t.points.map(p=>[p.lat,p.lng]),{weight:7}).addTo(map.current);map.current.fitBounds(route.current.getBounds(),{padding:[30,30]});setStatus(`Previous drive · ${t.distance.toFixed(1)} mi`)}
 function deleteTrip(id){const n=history.filter(h=>h.id!==id);setHistory(n);localStorage.setItem(HISTORY_KEY,JSON.stringify(n))}
 const fmt=ms=>{const t=Math.floor(ms/1000),h=Math.floor(t/3600),m=Math.floor((t%3600)/60),s=t%60;return h?`${h}h ${m}m`:`${m}m ${s}s`};


 async function refreshFish(){
   if(!pos?.length)return;
   setFishLoading(true);
   try{
     const [weather,marine]=await Promise.all([
       fetch(`https://api.open-meteo.com/v1/forecast?latitude=${pos[0]}&longitude=${pos[1]}&current=temperature_2m,precipitation,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m&hourly=cloud_cover,pressure_msl,wind_speed_10m,precipitation&forecast_days=2&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`).then(r=>r.json()),
       fetch(`https://marine-api.open-meteo.com/v1/marine?latitude=${pos[0]}&longitude=${pos[1]}&current=wave_height,sea_surface_temperature,ocean_current_velocity,ocean_current_direction,sea_level_height_msl&hourly=wave_height,sea_surface_temperature,ocean_current_velocity,ocean_current_direction,sea_level_height_msl&forecast_days=2&temperature_unit=fahrenheit&length_unit=imperial&timezone=auto`).then(r=>r.json()).catch(()=>({}))
     ]);
     const w=weather.current||{}, m=marine.current||{};
     const hour=new Date().getHours();
     const lowLight=(hour<=8||hour>=17)?18:6;
     const wind=Number(w.wind_speed_10m||0);
     const cloud=Number(w.cloud_cover||0);
     const pressure=Number(w.pressure_msl||1013);
     const current=Number(m.ocean_current_velocity||0);
     const wave=Number(m.wave_height||0);
     const sst=Number(m.sea_surface_temperature||0);

     let speciesAdj=0;
     const sp=fishSpecies.toLowerCase();
     if(sp.includes('striped')) speciesAdj=(sst>=50&&sst<=70?12:0)+(current>.25?8:0);
     else if(sp.includes('blue')) speciesAdj=(sst>=55&&sst<=75?10:0)+(current>.3?7:0);
     else if(sp.includes('fluke')) speciesAdj=(sst>=58&&sst<=75?10:0)+(wave<4?5:0);
     else if(sp.includes('largemouth')) speciesAdj=(w.temperature_2m>=55&&w.temperature_2m<=85?10:0);
     else speciesAdj=6;

     const windScore=wind>=4&&wind<=18?12:wind<25?6:0;
     const cloudScore=cloud>=35?8:3;
     const pressureScore=pressure>=1005&&pressure<=1020?8:4;
     const currentScore=current>.15&&current<2?10:4;
     const waveScore=wave>=.5&&wave<=5?8:3;
     const rainPenalty=Number(w.precipitation||0)>0.25?-5:0;
     let score=Math.round(35+lowLight+windScore+cloudScore+pressureScore+currentScore+waveScore+speciesAdj+rainPenalty);
     score=Math.max(12,Math.min(98,score));

     const windows=[];
     const now=new Date();
     for(let i=0;i<12;i++){
       const t=new Date(now.getTime()+i*60*60*1000);
       const h=t.getHours();
       let s=score+(h<=8||h>=17?8:-2);
       windows.push({time:t,score:Math.max(10,Math.min(99,s))});
     }
     windows.sort((a,b)=>b.score-a.score);
     setFishData({weather:w,marine:m,score,best:windows[0]});
     setFishUpdated(Date.now());
   }catch(e){
     setStatus(`Nova Fish: ${e.message}`);
   }finally{setFishLoading(false)}
 }
 useEffect(()=>{if(appMode==='fish')refreshFish()},[appMode,fishSpecies]);

 function saveFishSpot(){
   const spot={id:Date.now(),lat:pos[0],lng:pos[1],species:fishSpecies,score:fishData?.score||null,date:new Date().toLocaleString()};
   const next=[spot,...savedFishSpots].slice(0,30);
   setSavedFishSpots(next);localStorage.setItem('novaFishSpots',JSON.stringify(next));setStatus('Fishing spot saved');
 }
 function throwSuggestion(){
   const sp=fishSpecies.toLowerCase(), wind=fishData?.weather?.wind_speed_10m||0, cloud=fishData?.weather?.cloud_cover||0;
   if(sp.includes('striped')) return wind>12?'5–7" paddletail or bucktail':'SP Minnow / topwater / paddletail';
   if(sp.includes('blue')) return 'Metal jig, pencil popper, or durable minnow plug';
   if(sp.includes('fluke')) return 'Bucktail + Gulp, worked close to bottom';
   if(sp.includes('largemouth')) return cloud>50?'Spinnerbait / chatterbait':'Worm / jig / swimbait';
   if(sp.includes('trout')) return 'Small spoon, inline spinner, or natural bait';
   return 'Match local forage; start with a versatile swimbait';
 }
 return <div className="app"><div ref={mapEl} className="map"/><div className="top"><div className="modeBrand"><button className={appMode==='drive'?'active':''} onClick={()=>{setAppMode('drive');localStorage.setItem('gtiAppMode','drive')}}>GTI NAV</button><button className={appMode==='fish'?'active fish':''} onClick={()=>{setAppMode('fish');localStorage.setItem('gtiAppMode','fish')}}>NOVA FISH 🎣</button></div><div className="searchWrap"><form onSubmit={go}><input value={dest} onChange={e=>setDest(e.target.value)} placeholder="Where to?"/><button>{searching?'…':'GO'}</button></form>{suggestions.length>0&&<div className="suggestions">{suggestions.map((s,i)=><button key={s.place_id||i} onClick={()=>routeToPlace(s)}><span>⌖</span><span><strong>{s.name||s.display_name.split(',')[0]}</strong><small>{s.display_name}</small></span></button>)}</div>}</div></div>
 <div className="status">{status}</div>
 <div className="mapModes"><button className={mapMode==='street'?'active':''} onClick={()=>changeMapMode('street')}>MAP</button><button className={mapMode==='satellite'?'active':''} onClick={()=>changeMapMode('satellite')}>SAT</button><button className={mapMode==='hybrid'?'active':''} onClick={()=>changeMapMode('hybrid')}>HYBRID</button></div>
 <button className="loc" onClick={()=>map.current.flyTo(pos,17)}>◎</button><div className="speed"><strong>{Math.round(speed)}</strong><span>MPH</span></div>
 {appMode==='drive'&&<div className="panel"><div className="tabs"><button className={activeTab==='drive'?'active':''} onClick={()=>setActiveTab('drive')}>DRIVE</button><button className={activeTab==='convoy'?'active':''} onClick={()=>setActiveTab('convoy')}>CONVOY</button><button className={activeTab==='garage'?'active':''} onClick={()=>setActiveTab('garage')}>GARAGE</button><button className={activeTab==='history'?'active':''} onClick={()=>setActiveTab('history')}>HISTORY</button></div>
 {activeTab==='drive'&&<><div className="routeModes"><button className={routeMode==='fastest'?'active':''} onClick={()=>{setRouteMode('fastest');localStorage.setItem('gtiRouteMode','fastest')}}>FASTEST</button><button className={routeMode==='shortest'?'active':''} onClick={()=>{setRouteMode('shortest');localStorage.setItem('gtiRouteMode','shortest')}}>SHORTEST</button><button className={routeMode==='curvy'?'active':''} onClick={()=>{setRouteMode('curvy');localStorage.setItem('gtiRouteMode','curvy')}}>CURVY 🔥</button></div><div className="numbers"><span><b>{stats.dist.toFixed(2)}</b><small>MI</small></span><span><b>{Math.round(stats.avg)}</b><small>AVG MPH</small></span><span><b>{Math.round(stats.top)}</b><small>TOP MPH</small></span><span><b>{stats.start?fmt(Date.now()-stats.start):'0m 0s'}</b><small>TIME</small></span></div><div className="buttons"><button className={tracking?'danger':''} onClick={drive}>{tracking?'END DRIVE':'START DRIVE'}</button></div></>}
 {activeTab==='convoy'&&<div className="convoyPane"><div className="liveState"><i className={convoyLive?'on':''}></i>{convoyLive?`LIVE · ${room}`:'CONVOY OFFLINE'}</div><div className="convoy"><input value={name} onChange={e=>setName(e.target.value)} placeholder="Driver name"/><input value={room} onChange={e=>setRoom(e.target.value.toUpperCase())} placeholder="Convoy code"/><button onClick={()=>join()}>JOIN</button></div><div className="convoyBtns"><button onClick={create}>CREATE NEW CONVOY</button>{convoyLive&&<button onClick={leave}>LEAVE</button>}</div><small className="hint">Share the code with another GTI NAV user. Their GTI and live MPH will appear on your map.</small></div>}
  {activeTab==='garage'&&<div className="garage"><div className="garageTitle">CHOOSE YOUR GTI</div><div className="carChoices">{['MK5','MK6','MK7','MK7.5','MK8','GOLF R'].map(m=><button key={m} className={carModel===m?'active':''} onClick={()=>setCarModel(m)}>{m}</button>)}</div><div className="garageTitle">COLOR</div><div className="colorChoices">{['silver','black','white','red','blue','yellow'].map(c=><button aria-label={c} key={c} className={`swatch ${c} ${carColor===c?'active':''}`} onClick={()=>setCarColor(c)}></button>)}</div><small className="hint">Your choice is saved and shared with convoy members.</small></div>}
 {activeTab==='history'&&<div className="history">{history.length===0?<div className="empty">No previous drives yet.<br/><small>Finish a drive and it will appear here.</small></div>:history.map(h=><div className="trip" key={h.id}><button className="tripMain" onClick={()=>openTrip(h)}><span><strong>{new Date(h.started).toLocaleDateString()}</strong><small>{new Date(h.started).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</small></span><span><b>{h.distance.toFixed(1)} mi</b><small>{fmt(h.duration)}</small></span><span><b>{Math.round(h.avg)} avg</b><small>{Math.round(h.top)} top</small></span></button><button className="delete" onClick={()=>deleteTrip(h.id)}>×</button></div>)}</div>}</div>}
 {appMode==='fish'&&<div className="fishPanel">
   <div className="fishHead"><div><b>NOVA FISH</b><small>CONDITION PREDICTOR</small></div><button onClick={refreshFish}>{fishLoading?'…':'REFRESH'}</button></div>
   <div className="speciesRow">
     <select value={fishSpecies} onChange={e=>{setFishSpecies(e.target.value);localStorage.setItem('novaFishSpecies',e.target.value)}}>
       <option>Striped Bass</option><option>Bluefish</option><option>Fluke</option><option>Largemouth Bass</option><option>Trout</option><option>Smallmouth Bass</option>
     </select>
     <button onClick={saveFishSpot}>SAVE SPOT</button>
   </div>
   <div className="biteHero"><div className="biteScore"><strong>{fishData?.score??'--'}</strong><span>BITE SCORE</span></div><div className="bestWindow"><small>BEST WINDOW</small><b>{fishData?.best?fishData.best.time.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):'Waiting…'}</b><span>{fishData?.best?`${fishData.best.score}/100 predicted`:'Refresh conditions'}</span></div></div>
   <div className="fishGrid">
     <div><span>WATER TEMP</span><b>{fishData?.marine?.sea_surface_temperature!=null?`${Math.round(fishData.marine.sea_surface_temperature)}°F`:'N/A'}</b></div>
     <div><span>WAVES</span><b>{fishData?.marine?.wave_height!=null?`${Number(fishData.marine.wave_height).toFixed(1)} ft`:'N/A'}</b></div>
     <div><span>CURRENT</span><b>{fishData?.marine?.ocean_current_velocity!=null?`${Number(fishData.marine.ocean_current_velocity).toFixed(1)} mph`:'N/A'}</b></div>
     <div><span>SEA LEVEL / TIDE</span><b>{fishData?.marine?.sea_level_height_msl!=null?`${Number(fishData.marine.sea_level_height_msl).toFixed(2)} ft`:'N/A'}</b></div>
     <div><span>WIND</span><b>{fishData?.weather?.wind_speed_10m!=null?`${Math.round(fishData.weather.wind_speed_10m)} mph`:'--'}</b></div>
     <div><span>PRESSURE</span><b>{fishData?.weather?.pressure_msl!=null?`${Math.round(fishData.weather.pressure_msl)} hPa`:'--'}</b></div>
   </div>
   <div className="throwCard"><small>WHAT SHOULD I THROW?</small><b>{throwSuggestion()}</b></div>
   <div className="fishFoot"><span>{savedFishSpots.length} saved spots</span><span>{fishUpdated?`Updated ${new Date(fishUpdated).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}`:''}</span></div>
 </div>}</div>
}
ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
