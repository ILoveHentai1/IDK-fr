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
 const mapEl=useRef(null),map=useRef(null),marker=useRef(null),others=useRef(new Map()),channel=useRef(null);
 const prev=useRef(null),line=useRef(null),route=useRef(null),searchTimer=useRef(null),driverId=useRef(crypto.randomUUID());
 const [pos,setPos]=useState([42.3601,-71.0589]),[speed,setSpeed]=useState(0),[heading,setHeading]=useState(0);
 const [room,setRoom]=useState(''),[name,setName]=useState(localStorage.getItem('gtiNavName')||'Driver');
 const [dest,setDest]=useState(''),[suggestions,setSuggestions]=useState([]),[searching,setSearching]=useState(false);
 const [status,setStatus]=useState('Waiting for GPS'),[tracking,setTracking]=useState(false),[activeTab,setActiveTab]=useState('drive');
 const [drivePoints,setDrivePoints]=useState([]),[convoyLive,setConvoyLive]=useState(false);
 const [history,setHistory]=useState(()=>{try{return JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]')}catch{return []}});
 const [stats,setStats]=useState({start:0,top:0,avg:0,count:0,dist:0});

 const icon=(n,m,h,other=false)=>L.divIcon({className:'',iconSize:[70,62],iconAnchor:[35,48],html:`<div class="car ${other?'other':''}"><div class="tag">${n} · ${Math.round(m)} MPH</div><img src="./gti.svg" style="transform:rotate(${h||0}deg)"></div>`});

 useEffect(()=>{map.current=L.map(mapEl.current,{zoomControl:false}).setView(pos,15);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map.current);L.control.zoom({position:'bottomright'}).addTo(map.current);marker.current=L.marker(pos,{icon:icon('YOU',0,0)}).addTo(map.current);setTimeout(()=>map.current.invalidateSize(),100)},[]);

 useEffect(()=>{if(!navigator.geolocation){setStatus('GPS unavailable');return}const id=navigator.geolocation.watchPosition(p=>{const n=[p.coords.latitude,p.coords.longitude],mph=Math.max(0,(p.coords.speed||0)*2.236936),hd=Number.isFinite(p.coords.heading)?p.coords.heading:heading;setPos(n);setSpeed(mph);setHeading(hd);setStatus(`GPS ±${Math.round(p.coords.accuracy)}m`);marker.current?.setLatLng(n).setIcon(icon('YOU',mph,hd));
 if(tracking){if(prev.current){const d=L.latLng(prev.current).distanceTo(L.latLng(n))/1609.344;setStats(s=>({...s,dist:s.dist+d,top:Math.max(s.top,mph),avg:(s.avg*s.count+mph)/(s.count+1),count:s.count+1}))}prev.current=n;setDrivePoints(v=>[...v,{lat:n[0],lng:n[1],speed:mph,time:Date.now()}]);if(!line.current)line.current=L.polyline([],{weight:5}).addTo(map.current);line.current.addLatLng(n)}
 if(channel.current&&room)channel.current.send({type:'broadcast',event:'telemetry',payload:{id:driverId.current,name,lat:n[0],lng:n[1],speed:mph,heading:hd,ts:Date.now()}})},e=>setStatus(e.message),{enableHighAccuracy:true,maximumAge:1000});return()=>navigator.geolocation.clearWatch(id)},[tracking,room,name,heading]);

 useEffect(()=>{clearTimeout(searchTimer.current);const q=dest.trim();if(q.length<3){setSuggestions([]);return}searchTimer.current=setTimeout(async()=>{try{setSearching(true);const g=await fetch(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=6&q=${encodeURIComponent(q)}`).then(r=>r.json());setSuggestions(g)}catch{setSuggestions([])}finally{setSearching(false)}},350);return()=>clearTimeout(searchTimer.current)},[dest]);

 async function routeToPlace(place){try{setSuggestions([]);setDest(place.display_name||dest);setStatus('Routing…');const d=[+place.lat,+place.lon],r=await fetch(`https://router.project-osrm.org/route/v1/driving/${pos[1]},${pos[0]};${d[1]},${d[0]}?overview=full&geometries=geojson&steps=true`).then(r=>r.json());if(!r.routes?.[0])throw Error('No route');route.current?.remove();route.current=L.geoJSON(r.routes[0].geometry,{style:{weight:7}}).addTo(map.current);map.current.fitBounds(route.current.getBounds(),{padding:[30,30]});setStatus(`${(r.routes[0].distance/1609.344).toFixed(1)} mi · ${Math.round(r.routes[0].duration/60)} min`)}catch(err){setStatus(err.message)}}
 async function go(e){e.preventDefault();if(suggestions[0])return routeToPlace(suggestions[0]);try{const g=await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(dest)}`).then(r=>r.json());if(!g[0])throw Error('Destination not found');routeToPlace(g[0])}catch(err){setStatus(err.message)}}

 async function join(code=room){code=code.trim().toUpperCase();if(!code)return;localStorage.setItem('gtiNavName',name);if(channel.current)await supabase.removeChannel(channel.current);for(const [,m] of others.current)m.remove();others.current.clear();setRoom(code);setConvoyLive(false);const ch=supabase.channel(`convoy:${code}`,{config:{broadcast:{self:false}}});channel.current=ch;
 ch.on('broadcast',{event:'telemetry'},({payload:d})=>{if(!d||d.id===driverId.current||!d.lat)return;let m=others.current.get(d.id);if(!m){m=L.marker([d.lat,d.lng],{icon:icon(d.name,d.speed,d.heading,true)}).addTo(map.current);others.current.set(d.id,m)}else m.setLatLng([d.lat,d.lng]).setIcon(icon(d.name,d.speed,d.heading,true))});
 ch.on('broadcast',{event:'hello'},({payload:d})=>{if(!d||d.id===driverId.current)return;ch.send({type:'broadcast',event:'telemetry',payload:{id:driverId.current,name,lat:pos[0],lng:pos[1],speed,heading,ts:Date.now()}})});
 ch.subscribe(async state=>{if(state==='SUBSCRIBED'){setConvoyLive(true);setStatus(`Convoy ${code} live`);await ch.send({type:'broadcast',event:'hello',payload:{id:driverId.current,name}});await ch.send({type:'broadcast',event:'telemetry',payload:{id:driverId.current,name,lat:pos[0],lng:pos[1],speed,heading,ts:Date.now()}})}if(state==='CHANNEL_ERROR'||state==='TIMED_OUT'){setConvoyLive(false);setStatus('Convoy connection failed')}})}
 function create(){join(Math.random().toString(36).slice(2,8).toUpperCase())}
 async function leave(){if(channel.current)await supabase.removeChannel(channel.current);channel.current=null;for(const [,m] of others.current)m.remove();others.current.clear();setConvoyLive(false);setRoom('');setStatus('Left convoy')}

 function drive(){if(!tracking){setStats({start:Date.now(),top:0,avg:0,count:0,dist:0});setDrivePoints([]);prev.current=null;line.current?.remove();line.current=null;setTracking(true);setActiveTab('drive')}else{const ended=Date.now(),trip={id:ended,started:stats.start,ended,distance:stats.dist,top:stats.top,avg:stats.avg,duration:Math.max(0,ended-stats.start),points:drivePoints};const next=[trip,...history].slice(0,50);setHistory(next);localStorage.setItem(HISTORY_KEY,JSON.stringify(next));setTracking(false);setActiveTab('history')}}
 function openTrip(t){route.current?.remove();if(!t.points?.length){setStatus('No route saved for this drive');return}route.current=L.polyline(t.points.map(p=>[p.lat,p.lng]),{weight:7}).addTo(map.current);map.current.fitBounds(route.current.getBounds(),{padding:[30,30]});setStatus(`Previous drive · ${t.distance.toFixed(1)} mi`)}
 function deleteTrip(id){const n=history.filter(h=>h.id!==id);setHistory(n);localStorage.setItem(HISTORY_KEY,JSON.stringify(n))}
 const fmt=ms=>{const t=Math.floor(ms/1000),h=Math.floor(t/3600),m=Math.floor((t%3600)/60),s=t%60;return h?`${h}h ${m}m`:`${m}m ${s}s`};

 return <div className="app"><div ref={mapEl} className="map"/><div className="top"><b>GTI NAV</b><div className="searchWrap"><form onSubmit={go}><input value={dest} onChange={e=>setDest(e.target.value)} placeholder="Where to?"/><button>{searching?'…':'GO'}</button></form>{suggestions.length>0&&<div className="suggestions">{suggestions.map((s,i)=><button key={s.place_id||i} onClick={()=>routeToPlace(s)}><span>⌖</span><span><strong>{s.name||s.display_name.split(',')[0]}</strong><small>{s.display_name}</small></span></button>)}</div>}</div></div>
 <div className="status">{status}</div><button className="loc" onClick={()=>map.current.flyTo(pos,17)}>◎</button><div className="speed"><strong>{Math.round(speed)}</strong><span>MPH</span></div>
 <div className="panel"><div className="tabs"><button className={activeTab==='drive'?'active':''} onClick={()=>setActiveTab('drive')}>DRIVE</button><button className={activeTab==='convoy'?'active':''} onClick={()=>setActiveTab('convoy')}>CONVOY</button><button className={activeTab==='history'?'active':''} onClick={()=>setActiveTab('history')}>PREVIOUS DRIVES</button></div>
 {activeTab==='drive'&&<><div className="numbers"><span><b>{stats.dist.toFixed(2)}</b><small>MI</small></span><span><b>{Math.round(stats.avg)}</b><small>AVG MPH</small></span><span><b>{Math.round(stats.top)}</b><small>TOP MPH</small></span><span><b>{stats.start?fmt(Date.now()-stats.start):'0m 0s'}</b><small>TIME</small></span></div><div className="buttons"><button className={tracking?'danger':''} onClick={drive}>{tracking?'END DRIVE':'START DRIVE'}</button></div></>}
 {activeTab==='convoy'&&<div className="convoyPane"><div className="liveState"><i className={convoyLive?'on':''}></i>{convoyLive?`LIVE · ${room}`:'CONVOY OFFLINE'}</div><div className="convoy"><input value={name} onChange={e=>setName(e.target.value)} placeholder="Driver name"/><input value={room} onChange={e=>setRoom(e.target.value.toUpperCase())} placeholder="Convoy code"/><button onClick={()=>join()}>JOIN</button></div><div className="convoyBtns"><button onClick={create}>CREATE NEW CONVOY</button>{convoyLive&&<button onClick={leave}>LEAVE</button>}</div><small className="hint">Share the code with another GTI NAV user. Their GTI and live MPH will appear on your map.</small></div>}
 {activeTab==='history'&&<div className="history">{history.length===0?<div className="empty">No previous drives yet.<br/><small>Finish a drive and it will appear here.</small></div>:history.map(h=><div className="trip" key={h.id}><button className="tripMain" onClick={()=>openTrip(h)}><span><strong>{new Date(h.started).toLocaleDateString()}</strong><small>{new Date(h.started).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</small></span><span><b>{h.distance.toFixed(1)} mi</b><small>{fmt(h.duration)}</small></span><span><b>{Math.round(h.avg)} avg</b><small>{Math.round(h.top)} top</small></span></button><button className="delete" onClick={()=>deleteTrip(h.id)}>×</button></div>)}</div>}</div></div>
}
ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
