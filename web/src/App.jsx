import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { io } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
const ROUTER = 'https://router.project-osrm.org/route/v1/driving';
const GEOCODER = 'https://nominatim.openstreetmap.org/search';

const uid = () => localStorage.getItem('gti-user-id') || (() => {
  const id = crypto.randomUUID(); localStorage.setItem('gti-user-id', id); return id;
})();
const userId = uid();
const randomCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();
const mph = (mps=0) => Math.max(0, mps * 2.236936).toFixed(0);
const haversineMiles = (a,b) => {
  const R=3958.8, toRad=x=>x*Math.PI/180;
  const dLat=toRad(b.lat-a.lat), dLon=toRad(b.lng-a.lng);
  const h=Math.sin(dLat/2)**2+Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(h));
};

function makeCarIcon(label='', speed='') {
  return L.divIcon({
    className: 'car-marker-shell',
    html: `<div class="car-label">${label}${speed !== '' ? ` · ${speed} MPH` : ''}</div><div class="car-rotator"><img src="${import.meta.env.BASE_URL}gti.svg" /></div>`,
    iconSize: [58, 92], iconAnchor: [29, 56]
  });
}

export default function App(){
  const mapNode = useRef(null), mapRef = useRef(null), meMarker = useRef(null), routeLine = useRef(null);
  const convoyMarkers = useRef(new Map()), watchRef = useRef(null), socketRef = useRef(null), lastPoint = useRef(null);
  const [pos,setPos]=useState(null), [heading,setHeading]=useState(0), [speed,setSpeed]=useState(0);
  const [search,setSearch]=useState(''), [route,setRoute]=useState(null), [instruction,setInstruction]=useState('Choose a destination');
  const [username,setUsername]=useState(localStorage.getItem('gti-username')||'Driver');
  const [convoyCode,setConvoyCode]=useState(localStorage.getItem('gti-convoy')||''), [members,setMembers]=useState([]);
  const [panel,setPanel]=useState('nav'), [tracking,setTracking]=useState(false), [trip,setTrip]=useState(null);
  const [history,setHistory]=useState(()=>JSON.parse(localStorage.getItem('gti-history')||'[]'));
  const [error,setError]=useState('');
  const socket = useMemo(()=>io(SERVER_URL,{autoConnect:false,transports:['websocket','polling']}),[]);

  useEffect(()=>{
    if(mapRef.current) return;
    const map=L.map(mapNode.current,{zoomControl:false,attributionControl:true}).setView([42.3601,-71.0589],13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(map);
    L.control.zoom({position:'bottomright'}).addTo(map);
    mapRef.current=map;
    return()=>map.remove();
  },[]);

  useEffect(()=>{
    socketRef.current=socket;
    socket.on('convoy:state',setMembers);
    socket.on('telemetry:update',u=>setMembers(prev=>[...prev.filter(x=>x.id!==u.id),u]));
    socket.on('connect_error',()=>setError('Convoy server offline — navigation still works.'));
    if(convoyCode) joinConvoy(convoyCode);
    return()=>{socket.removeAllListeners();socket.disconnect();};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[socket]);

  useEffect(()=>{
    if(!mapRef.current) return;
    for(const [id,m] of convoyMarkers.current){ if(!members.find(x=>x.id===id)){mapRef.current.removeLayer(m);convoyMarkers.current.delete(id);} }
    members.filter(m=>m.id!==userId&&m.lat!=null&&m.lng!=null).forEach(m=>{
      let marker=convoyMarkers.current.get(m.id);
      if(!marker){marker=L.marker([m.lat,m.lng],{icon:makeCarIcon(m.username,m.speedMph??0)}).addTo(mapRef.current);convoyMarkers.current.set(m.id,marker);}
      marker.setLatLng([m.lat,m.lng]); marker.setIcon(makeCarIcon(m.username,m.speedMph??0));
      const el=marker.getElement()?.querySelector('.car-rotator'); if(el) el.style.transform=`rotate(${m.heading||0}deg)`;
    });
  },[members]);

  useEffect(()=>{
    if(!navigator.geolocation){setError('Geolocation is not supported on this device.');return;}
    watchRef.current=navigator.geolocation.watchPosition(({coords})=>{
      const p={lat:coords.latitude,lng:coords.longitude}; const hd=Number.isFinite(coords.heading)?coords.heading:(lastPoint.current?bearing(lastPoint.current,p):heading);
      const sp=Number.isFinite(coords.speed)?Number(mph(coords.speed)):0;
      setPos(p);setHeading(hd||0);setSpeed(sp);lastPoint.current=p;
      if(mapRef.current){
        if(!meMarker.current){meMarker.current=L.marker([p.lat,p.lng],{icon:makeCarIcon('YOU',sp),zIndexOffset:1000}).addTo(mapRef.current);mapRef.current.setView([p.lat,p.lng],17);}
        else {meMarker.current.setLatLng([p.lat,p.lng]);meMarker.current.setIcon(makeCarIcon('YOU',sp));}
        const el=meMarker.current.getElement()?.querySelector('.car-rotator');if(el)el.style.transform=`rotate(${hd||0}deg)`;
      }
      if(convoyCode&&socket.connected) socket.emit('telemetry:update',{lat:p.lat,lng:p.lng,heading:hd||0,speedMph:sp,username});
      if(tracking) setTrip(t=>appendTripPoint(t,p,sp));
    },e=>setError(e.code===1?'Location permission is required for live navigation.':e.message),{enableHighAccuracy:true,maximumAge:1000,timeout:12000});
    return()=>navigator.geolocation.clearWatch(watchRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[convoyCode,tracking,username]);

  useEffect(()=>{
    if(!pos||!route?.destination) return;
    const d=haversineMiles(pos,route.destination);
    if(d>0.08) return;
    setInstruction('You have arrived');
  },[pos,route]);

  function bearing(a,b){const y=Math.sin((b.lng-a.lng)*Math.PI/180)*Math.cos(b.lat*Math.PI/180);const x=Math.cos(a.lat*Math.PI/180)*Math.sin(b.lat*Math.PI/180)-Math.sin(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.cos((b.lng-a.lng)*Math.PI/180);return (Math.atan2(y,x)*180/Math.PI+360)%360;}
  function appendTripPoint(t,p,sp){if(!t)return t;const points=t.points||[];const prev=points.at(-1);const dist=prev?haversineMiles(prev,p):0;return {...t,points:[...points,{...p,speed:sp,t:Date.now()}],distance:t.distance+dist,topSpeed:Math.max(t.topSpeed,sp),speedSum:t.speedSum+sp,samples:t.samples+1};}

  async function findRoute(e){
    e?.preventDefault();setError(''); if(!pos){setError('Waiting for your GPS location.');return;} if(!search.trim())return;
    try{
      const g=await fetch(`${GEOCODER}?format=jsonv2&limit=1&q=${encodeURIComponent(search)}`,{headers:{'Accept':'application/json'}}).then(r=>r.json());
      if(!g.length)throw new Error('Destination not found');
      const dest={lat:+g[0].lat,lng:+g[0].lon,name:g[0].display_name};
      const data=await fetch(`${ROUTER}/${pos.lng},${pos.lat};${dest.lng},${dest.lat}?overview=full&geometries=geojson&steps=true`).then(r=>r.json());
      if(data.code!=='Ok'||!data.routes?.length)throw new Error('Route unavailable');
      const r=data.routes[0], coords=r.geometry.coordinates.map(([lng,lat])=>[lat,lng]);
      routeLine.current?.remove(); routeLine.current=L.polyline(coords,{weight:7,opacity:.9}).addTo(mapRef.current); mapRef.current.fitBounds(routeLine.current.getBounds(),{padding:[40,40]});
      const first=r.legs?.[0]?.steps?.[0];
      const turn = first?.maneuver?.modifier ? `${first.maneuver.type} ${first.maneuver.modifier}` : first?.maneuver?.type;
      setInstruction(turn ? `${turn.replaceAll('_',' ')}${first?.name ? ` onto ${first.name}` : ''}` : 'Route ready');
      setRoute({destination:dest,distanceMiles:r.distance/1609.344,durationMin:r.duration/60});
    }catch(err){setError(err.message||'Could not calculate route.');}
  }

  function joinConvoy(code=convoyCode){
    const c=String(code||'').trim().toUpperCase(); if(!c)return;
    localStorage.setItem('gti-convoy',c);localStorage.setItem('gti-username',username);setConvoyCode(c);
    if(!socket.connected)socket.connect();
    socket.emit('convoy:join',{code:c,user:{id:userId,username,lat:pos?.lat,lng:pos?.lng,heading,speedMph:speed}});
    setPanel('convoy');
  }
  function createConvoy(){const c=randomCode();setConvoyCode(c);setTimeout(()=>joinConvoy(c),0);}
  function leaveConvoy(){localStorage.removeItem('gti-convoy');setConvoyCode('');setMembers([]);socket.disconnect();for(const m of convoyMarkers.current.values())mapRef.current?.removeLayer(m);convoyMarkers.current.clear();}

  function toggleDrive(){
    if(!tracking){setTrip({id:crypto.randomUUID(),startedAt:Date.now(),points:[],distance:0,topSpeed:0,speedSum:0,samples:0});setTracking(true);return;}
    const endedAt=Date.now();const completed={...trip,endedAt,avgSpeed:trip?.samples?trip.speedSum/trip.samples:0,durationMs:endedAt-(trip?.startedAt||endedAt)};
    const next=[completed,...history].slice(0,50);setHistory(next);localStorage.setItem('gti-history',JSON.stringify(next));setTracking(false);setTrip(null);setPanel('history');
  }

  function showTrip(t){if(!t?.points?.length)return; const line=L.polyline(t.points.map(p=>[p.lat,p.lng]),{weight:6}).addTo(mapRef.current);mapRef.current.fitBounds(line.getBounds(),{padding:[40,40]});setTimeout(()=>line.remove(),12000);}

  return <div className="app">
    <div ref={mapNode} className="map" />
    <header className="topbar">
      <div className="brand"><span className="brand-dot"/>GTI NAV <small>{socket.connected?'LIVE':'LOCAL'}</small></div>
      <form className="search" onSubmit={findRoute}><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Where to?"/><button>GO</button></form>
    </header>

    <aside className="side-tabs">
      <button className={panel==='nav'?'active':''} onClick={()=>setPanel('nav')}>NAV</button>
      <button className={panel==='convoy'?'active':''} onClick={()=>setPanel('convoy')}>CREW</button>
      <button className={panel==='history'?'active':''} onClick={()=>setPanel('history')}>LOGS</button>
    </aside>

    <section className="hud">
      <div className="speed"><strong>{Math.round(speed)}</strong><span>MPH</span></div>
      <div className="instruction"><b>{instruction}</b>{route&&<small>{route.distanceMiles.toFixed(1)} mi · {Math.round(route.durationMin)} min</small>}</div>
      <button className={tracking?'end-drive':'start-drive'} onClick={toggleDrive}>{tracking?'END DRIVE':'START DRIVE'}</button>
    </section>

    <section className={`drawer ${panel}`}>
      <button className="drawer-close" onClick={()=>setPanel('nav')}>×</button>
      {panel==='nav'&&<><h2>Navigation</h2><p>Live GPS: {pos?`${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`:'waiting…'}</p><p>Heading: {Math.round(heading)}° · Speed: {Math.round(speed)} MPH</p><button onClick={()=>pos&&mapRef.current?.setView([pos.lat,pos.lng],17)}>CENTER ON GTI</button></>}
      {panel==='convoy'&&<><h2>Convoy</h2><label>Driver name<input value={username} onChange={e=>setUsername(e.target.value.slice(0,20))}/></label>{!convoyCode?<><button onClick={createConvoy}>CREATE CONVOY</button><div className="join"><input placeholder="Invite code" onChange={e=>setConvoyCode(e.target.value.toUpperCase())}/><button onClick={()=>joinConvoy()}>JOIN</button></div></>:<><div className="code">CODE <strong>{convoyCode}</strong></div><p>{members.filter(m=>m.online!==false).length || 1} driver(s) connected</p><div className="members">{members.map(m=><div key={m.id}><span>{m.id===userId?'YOU':m.username}</span><b>{Math.round(m.speedMph||0)} MPH</b></div>)}</div><button className="danger" onClick={leaveConvoy}>LEAVE CONVOY</button></>}</>}
      {panel==='history'&&<><h2>Drive History</h2>{!history.length?<p>No saved drives yet.</p>:history.map(t=><button className="trip" key={t.id} onClick={()=>showTrip(t)}><span>{new Date(t.startedAt).toLocaleString()}</span><b>{t.distance.toFixed(1)} mi</b><small>{Math.round(t.topSpeed)} top · {Math.round(t.avgSpeed)} avg MPH · {Math.round(t.durationMs/60000)} min</small></button>)}</>}
    </section>
    {tracking&&<div className="recording">● RECORDING {trip?.distance.toFixed(2)} MI</div>}
    {error&&<button className="error" onClick={()=>setError('')}>{error} ×</button>}
  </div>
}
