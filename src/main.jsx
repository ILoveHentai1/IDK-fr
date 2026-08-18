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
 const prev=useRef(null),line=useRef(null),route=useRef(null),searchTimer=useRef(null),driverId=useRef(crypto.randomUUID()),convoyTracks=useRef(new Map()),replayLines=useRef([]);
 const [pos,setPos]=useState([42.3601,-71.0589]),[speed,setSpeed]=useState(0),[heading,setHeading]=useState(0);
 const [room,setRoom]=useState(''),[name,setName]=useState(localStorage.getItem('gtiNavName')||'Driver');
 const [dest,setDest]=useState(''),[suggestions,setSuggestions]=useState([]),[searching,setSearching]=useState(false);
 const [status,setStatus]=useState('Waiting for GPS'),[tracking,setTracking]=useState(false),[activeTab,setActiveTab]=useState('drive');
 const [drivePoints,setDrivePoints]=useState([]),[convoyLive,setConvoyLive]=useState(false);
 const [mapMode,setMapMode]=useState(localStorage.getItem('gtiMapMode')||'street'),[routeMode,setRouteMode]=useState(localStorage.getItem('gtiRouteMode')||'fastest'),[carModel,setCarModel]=useState(localStorage.getItem('gtiCarModel')||'MK6'),[carColor,setCarColor]=useState(localStorage.getItem('gtiCarColor')||'silver');
 const [history,setHistory]=useState(()=>{try{return JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]')}catch{return []}});
 const [stats,setStats]=useState({start:0,top:0,avg:0,count:0,dist:0});
 const [captureMode,setCaptureMode]=useState(localStorage.getItem('gtiCaptureMode')||'individual');

 const icon=(n,m,h,other=false,model=carModel,color=carColor)=>L.divIcon({className:'',iconSize:[76,66],iconAnchor:[38,50],html:`<div class="car ${other?'other':''} color-${color}"><div class="tag">${n} · ${Math.round(m)} MPH</div><div class="modelTag">${model}</div><img src="./gti.svg" style="transform:rotate(${h||0}deg)"></div>`});

 useEffect(()=>{map.current=L.map(mapEl.current,{zoomControl:false}).setView(pos,15);baseLayer.current=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map.current);L.control.zoom({position:'bottomright'}).addTo(map.current);marker.current=L.marker(pos,{icon:icon('YOU',0,0,false,carModel,carColor)}).addTo(map.current);setTimeout(()=>map.current.invalidateSize(),100)},[]);

 function changeMapMode(mode){if(!map.current)return;baseLayer.current?.remove();if(mode==='satellite'||mode==='hybrid'){baseLayer.current=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'Tiles © Esri'}).addTo(map.current)}else{baseLayer.current=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map.current)}setMapMode(mode);localStorage.setItem('gtiMapMode',mode)}
 useEffect(()=>{if(map.current)changeMapMode(mapMode)},[]);
 useEffect(()=>{localStorage.setItem('gtiCarModel',carModel);localStorage.setItem('gtiCarColor',carColor);marker.current?.setIcon(icon('YOU',speed,heading,false,carModel,carColor))},[carModel,carColor]);

 useEffect(()=>{if(!navigator.geolocation){setStatus('GPS unavailable');return}const id=navigator.geolocation.watchPosition(p=>{const n=[p.coords.latitude,p.coords.longitude],mph=Math.max(0,(p.coords.speed||0)*2.236936),hd=Number.isFinite(p.coords.heading)?p.coords.heading:heading;setPos(n);setSpeed(mph);setHeading(hd);setStatus(`GPS ±${Math.round(p.coords.accuracy)}m`);marker.current?.setLatLng(n).setIcon(icon('YOU',mph,hd));
 if(tracking){if(prev.current){const d=L.latLng(prev.current).distanceTo(L.latLng(n))/1609.344;setStats(s=>({...s,dist:s.dist+d,top:Math.max(s.top,mph),avg:(s.avg*s.count+mph)/(s.count+1),count:s.count+1}))}prev.current=n;setDrivePoints(v=>[...v,{lat:n[0],lng:n[1],speed:mph,time:Date.now()}]);if(!line.current)line.current=L.polyline([],{weight:5}).addTo(map.current);line.current.addLatLng(n)}
 if(channel.current&&room)channel.current.send({type:'broadcast',event:'telemetry',payload:{id:driverId.current,name,lat:n[0],lng:n[1],speed:mph,heading:hd,model:carModel,color:carColor,ts:Date.now()}})},e=>setStatus(e.message),{enableHighAccuracy:true,maximumAge:1000});return()=>navigator.geolocation.clearWatch(id)},[tracking,room,name,heading]);

 useEffect(()=>{clearTimeout(searchTimer.current);const q=dest.trim();if(q.length<3){setSuggestions([]);return}searchTimer.current=setTimeout(async()=>{try{setSearching(true);const g=await fetch(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=6&q=${encodeURIComponent(q)}`).then(r=>r.json());setSuggestions(g)}catch{setSuggestions([])}finally{setSearching(false)}},350);return()=>clearTimeout(searchTimer.current)},[dest]);


 function bearing(a,b){
   const p1=a[1]*Math.PI/180,p2=b[1]*Math.PI/180,dl=(b[0]-a[0])*Math.PI/180;
   const y=Math.sin(dl)*Math.cos(p2),x=Math.cos(p1)*Math.sin(p2)-Math.sin(p1)*Math.cos(p2)*Math.cos(dl);
   return (Math.atan2(y,x)*180/Math.PI+360)%360
 }
 function angleDelta(a,b){let d=Math.abs(a-b)%360;return d>180?360-d:d}
 function curvyScore(r,fastest){
   const c=r.geometry?.coordinates||[];if(c.length<3)return 0;
   const sampled=[c[0]];let acc=0,last=c[0];
   for(let i=1;i<c.length;i++){
     const here=c[i],meters=L.latLng(last[1],last[0]).distanceTo(L.latLng(here[1],here[0]));acc+=meters;last=here;
     if(acc>=85){sampled.push(here);acc=0}
   }
   if(sampled.length<4)return 0;
   let turn=0,meaningful=0;
   for(let i=2;i<sampled.length;i++){
     const d=angleDelta(bearing(sampled[i-2],sampled[i-1]),bearing(sampled[i-1],sampled[i]));
     if(d>=7){turn+=Math.min(d,75);meaningful++}
   }
   const miles=Math.max(.1,r.distance/1609.344),turnDensity=turn/miles,turnCount=meaningful/miles;
   const distancePenalty=Math.max(0,(r.distance/fastest.distance)-1.42)*150;
   const timePenalty=Math.max(0,(r.duration/fastest.duration)-1.55)*100;
   return turnDensity+turnCount*8-distancePenalty-timePenalty
 }
 async function routeToPlace(place){try{
   setSuggestions([]);setDest(place.display_name||dest);setStatus('Routing…');
   const d=[+place.lat,+place.lon],r=await fetch(`https://router.project-osrm.org/route/v1/driving/${pos[1]},${pos[0]};${d[1]},${d[0]}?overview=full&geometries=geojson&steps=true&alternatives=3`).then(r=>r.json());
   if(!r.routes?.length)throw Error('No route');
   const choices=[...r.routes],fastest=[...choices].sort((a,b)=>a.duration-b.duration)[0];
   let chosen=fastest,curve=null;
   if(routeMode==='shortest')chosen=[...choices].sort((a,b)=>a.distance-b.distance)[0];
   if(routeMode==='curvy'){
     const ranked=choices.map(x=>({route:x,score:curvyScore(x,fastest)})).sort((a,b)=>b.score-a.score);
     chosen=ranked[0]?.route||fastest;curve=ranked[0]?.score||0;
   }
   route.current?.remove();
   route.current=L.geoJSON(chosen.geometry,{style:{weight:7}}).addTo(map.current);
   map.current.fitBounds(route.current.getBounds(),{padding:[30,30]});
   const label=routeMode==='curvy'?`Curvy · ${Math.max(0,curve).toFixed(0)} curve score`:routeMode[0].toUpperCase()+routeMode.slice(1);
   setStatus(`${label} · ${(chosen.distance/1609.344).toFixed(1)} mi · ${Math.round(chosen.duration/60)} min`)
 }catch(err){setStatus(err.message)}}
 async function go(e){e.preventDefault();if(suggestions[0])return routeToPlace(suggestions[0]);try{const g=await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(dest)}`).then(r=>r.json());if(!g[0])throw Error('Destination not found');routeToPlace(g[0])}catch(err){setStatus(err.message)}}

 async function join(code=room){code=code.trim().toUpperCase();if(!code)return;localStorage.setItem('gtiNavName',name);if(channel.current)await supabase.removeChannel(channel.current);for(const [,m] of others.current)m.remove();others.current.clear();setRoom(code);setConvoyLive(false);const ch=supabase.channel(`convoy:${code}`,{config:{broadcast:{self:false}}});channel.current=ch;
 ch.on('broadcast',{event:'telemetry'},({payload:d})=>{
   if(!d||d.id===driverId.current||!d.lat)return;
   let m=others.current.get(d.id);
   if(!m){m=L.marker([d.lat,d.lng],{icon:icon(d.name,d.speed,d.heading,true,d.model||'GTI',d.color||'silver')}).addTo(map.current);others.current.set(d.id,m)}
   else m.setLatLng([d.lat,d.lng]).setIcon(icon(d.name,d.speed,d.heading,true,d.model||'GTI',d.color||'silver'));
   if(tracking&&captureMode==='convoy'){
     let t=convoyTracks.current.get(d.id);
     if(!t){t={id:d.id,name:d.name||'Driver',model:d.model||'GTI',color:d.color||'silver',points:[]};convoyTracks.current.set(d.id,t)}
     t.name=d.name||t.name;t.model=d.model||t.model;t.color=d.color||t.color;
     const last=t.points[t.points.length-1];
     if(!last||Math.abs(last.lat-d.lat)>0.000001||Math.abs(last.lng-d.lng)>0.000001)t.points.push({lat:d.lat,lng:d.lng,speed:Number(d.speed||0),heading:Number(d.heading||0),time:d.ts||Date.now()})
   }
 });
 ch.on('broadcast',{event:'hello'},({payload:d})=>{if(!d||d.id===driverId.current)return;ch.send({type:'broadcast',event:'telemetry',payload:{id:driverId.current,name,lat:pos[0],lng:pos[1],speed,heading,model:carModel,color:carColor,ts:Date.now()}})});
 ch.subscribe(async state=>{if(state==='SUBSCRIBED'){setConvoyLive(true);setStatus(`Convoy ${code} live`);await ch.send({type:'broadcast',event:'hello',payload:{id:driverId.current,name}});await ch.send({type:'broadcast',event:'telemetry',payload:{id:driverId.current,name,lat:pos[0],lng:pos[1],speed,heading,model:carModel,color:carColor,ts:Date.now()}})}if(state==='CHANNEL_ERROR'||state==='TIMED_OUT'){setConvoyLive(false);setStatus('Convoy connection failed')}})}
 function create(){join(Math.random().toString(36).slice(2,8).toUpperCase())}
 async function leave(){if(channel.current)await supabase.removeChannel(channel.current);channel.current=null;for(const [,m] of others.current)m.remove();others.current.clear();setConvoyLive(false);setRoom('');setStatus('Left convoy')}

 function summarizeTrack(points){
   let dist=0,top=0,total=0,count=0;
   for(let i=0;i<points.length;i++){
     const s=Number(points[i].speed||0);top=Math.max(top,s);total+=s;count++;
     if(i)dist+=L.latLng(points[i-1].lat,points[i-1].lng).distanceTo(L.latLng(points[i].lat,points[i].lng))/1609.344
   }
   return {distance:dist,top,avg:count?total/count:0}
 }
 function drive(){
   if(!tracking){
     setStats({start:Date.now(),top:0,avg:0,count:0,dist:0});setDrivePoints([]);prev.current=null;
     convoyTracks.current=new Map();line.current?.remove();line.current=null;replayLines.current.forEach(x=>x.remove());replayLines.current=[];
     setTracking(true);setActiveTab('drive')
   }else{
     const ended=Date.now();
     const members=captureMode==='convoy'?[...convoyTracks.current.values()].filter(x=>x.points.length>1).map(x=>({...x,...summarizeTrack(x.points)})):[];
     const trip={id:ended,started:stats.start,ended,distance:stats.dist,top:stats.top,avg:stats.avg,duration:Math.max(0,ended-stats.start),points:drivePoints,captureMode,convoyRoom:captureMode==='convoy'?room:'',members};
     const next=[trip,...history].slice(0,50);setHistory(next);localStorage.setItem(HISTORY_KEY,JSON.stringify(next));setTracking(false);setActiveTab('history')
   }
 }
 function openTrip(t){
   route.current?.remove();replayLines.current.forEach(x=>x.remove());replayLines.current=[];
   if(!t.points?.length){setStatus('No route saved for this drive');return}
   const own=L.polyline(t.points.map(p=>[p.lat,p.lng]),{weight:7}).addTo(map.current);replayLines.current.push(own);
   const convoy=t.members||[];
   const palette=['#ff4b65','#4dc3ff','#8eff7c','#ffd84d','#b77dff','#ff9d4d'];
   convoy.forEach((m,i)=>{if(m.points?.length){const l=L.polyline(m.points.map(p=>[p.lat,p.lng]),{weight:5,color:palette[i%palette.length],opacity:.9}).addTo(map.current);replayLines.current.push(l)}});
   const group=L.featureGroup(replayLines.current);map.current.fitBounds(group.getBounds(),{padding:[30,30]});
   setStatus(`${t.captureMode==='convoy'?'Convoy drive':'Drive'} · ${t.distance.toFixed(1)} mi${convoy.length?` · ${convoy.length} convoy member${convoy.length===1?'':'s'}`:''}`)
 }
 function deleteTrip(id){const n=history.filter(h=>h.id!==id);setHistory(n);localStorage.setItem(HISTORY_KEY,JSON.stringify(n))}
 const fmt=ms=>{const t=Math.floor(ms/1000),h=Math.floor(t/3600),m=Math.floor((t%3600)/60),s=t%60;return h?`${h}h ${m}m`:`${m}m ${s}s`};

 return <div className="app"><div ref={mapEl} className="map"/><div className="top"><b>GTI NAV</b><div className="searchWrap"><form onSubmit={go}><input value={dest} onChange={e=>setDest(e.target.value)} placeholder="Where to?"/><button>{searching?'…':'GO'}</button></form>{suggestions.length>0&&<div className="suggestions">{suggestions.map((s,i)=><button key={s.place_id||i} onClick={()=>routeToPlace(s)}><span>⌖</span><span><strong>{s.name||s.display_name.split(',')[0]}</strong><small>{s.display_name}</small></span></button>)}</div>}</div></div>
 <div className="status">{status}</div>
 <div className="mapModes"><button className={mapMode==='street'?'active':''} onClick={()=>changeMapMode('street')}>MAP</button><button className={mapMode==='satellite'?'active':''} onClick={()=>changeMapMode('satellite')}>SAT</button><button className={mapMode==='hybrid'?'active':''} onClick={()=>changeMapMode('hybrid')}>HYBRID</button></div>
 <button className="loc" onClick={()=>map.current.flyTo(pos,17)}>◎</button><div className="speed"><strong>{Math.round(speed)}</strong><span>MPH</span></div>
 <div className="panel"><div className="tabs"><button className={activeTab==='drive'?'active':''} onClick={()=>setActiveTab('drive')}>DRIVE</button><button className={activeTab==='convoy'?'active':''} onClick={()=>setActiveTab('convoy')}>CONVOY</button><button className={activeTab==='garage'?'active':''} onClick={()=>setActiveTab('garage')}>GARAGE</button><button className={activeTab==='history'?'active':''} onClick={()=>setActiveTab('history')}>HISTORY</button></div>
 {activeTab==='drive'&&<><div className="routeModes"><button className={routeMode==='fastest'?'active':''} onClick={()=>{setRouteMode('fastest');localStorage.setItem('gtiRouteMode','fastest')}}>FASTEST</button><button className={routeMode==='shortest'?'active':''} onClick={()=>{setRouteMode('shortest');localStorage.setItem('gtiRouteMode','shortest')}}>SHORTEST</button><button className={routeMode==='curvy'?'active':''} onClick={()=>{setRouteMode('curvy');localStorage.setItem('gtiRouteMode','curvy')}}>CURVY 🔥</button></div><div className="captureModes"><span>SAVE DRIVE</span><div><button disabled={tracking} className={captureMode==='individual'?'active':''} onClick={()=>{setCaptureMode('individual');localStorage.setItem('gtiCaptureMode','individual')}}>INDIVIDUAL</button><button disabled={tracking} className={captureMode==='convoy'?'active':''} onClick={()=>{setCaptureMode('convoy');localStorage.setItem('gtiCaptureMode','convoy')}}>CONVOY</button></div><small>{captureMode==='convoy'?'Records your route + live convoy member routes':'Records only your route'}</small></div><div className="numbers"><span><b>{stats.dist.toFixed(2)}</b><small>MI</small></span><span><b>{Math.round(stats.avg)}</b><small>AVG MPH</small></span><span><b>{Math.round(stats.top)}</b><small>TOP MPH</small></span><span><b>{stats.start?fmt(Date.now()-stats.start):'0m 0s'}</b><small>TIME</small></span></div><div className="buttons"><button className={tracking?'danger':''} onClick={drive}>{tracking?'END DRIVE':'START DRIVE'}</button></div></>}
 {activeTab==='convoy'&&<div className="convoyPane"><div className="liveState"><i className={convoyLive?'on':''}></i>{convoyLive?`LIVE · ${room}`:'CONVOY OFFLINE'}</div><div className="convoy"><input value={name} onChange={e=>setName(e.target.value)} placeholder="Driver name"/><input value={room} onChange={e=>setRoom(e.target.value.toUpperCase())} placeholder="Convoy code"/><button onClick={()=>join()}>JOIN</button></div><div className="convoyBtns"><button onClick={create}>CREATE NEW CONVOY</button>{convoyLive&&<button onClick={leave}>LEAVE</button>}</div><small className="hint">Share the code with another GTI NAV user. Their GTI and live MPH will appear on your map.</small></div>}
  {activeTab==='garage'&&<div className="garage"><div className="garageTitle">CHOOSE YOUR GTI</div><div className="carChoices">{['MK5','MK6','MK7','MK7.5','MK8','GOLF R'].map(m=><button key={m} className={carModel===m?'active':''} onClick={()=>setCarModel(m)}>{m}</button>)}</div><div className="garageTitle">COLOR</div><div className="colorChoices">{['silver','black','white','red','blue','yellow'].map(c=><button aria-label={c} key={c} className={`swatch ${c} ${carColor===c?'active':''}`} onClick={()=>setCarColor(c)}></button>)}</div><small className="hint">Your choice is saved and shared with convoy members.</small></div>}
 {activeTab==='history'&&<div className="history">{history.length===0?<div className="empty">No previous drives yet.<br/><small>Finish a drive and it will appear here.</small></div>:history.map(h=><div className="trip" key={h.id}><button className="tripMain" onClick={()=>openTrip(h)}><span><strong>{new Date(h.started).toLocaleDateString()}</strong><small>{new Date(h.started).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</small></span><span><b>{h.distance.toFixed(1)} mi</b><small>{fmt(h.duration)}</small></span><span><b>{Math.round(h.avg)} avg</b><small>{h.captureMode==='convoy'&&h.members?.length?`${h.members.length} convoy · `:''}${Math.round(h.top)} top</small></span></button><button className="delete" onClick={()=>deleteTrip(h.id)}>×</button></div>)}</div>}</div></div>
}
ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
