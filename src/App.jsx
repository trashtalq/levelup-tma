import { useState, useEffect, useRef, useCallback } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// SUPABASE CLIENT
// ─────────────────────────────────────────────────────────────────────────────
const SUPABASE_URL = "https://pyjqtkngvdajpsgiwcdm.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5anF0a25ndmRhanBzZ2l3Y2RtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MzcxMjEsImV4cCI6MjA5NzIxMzEyMX0.iXKKfKSxv_QTiF9J0hSh2vDlylHai1AwfIEvHJCKxWQ";

// ─────────────────────────────────────────────────────────────────────────────
// TELEGRAM BOT — send notifications to user's private chat
// ─────────────────────────────────────────────────────────────────────────────
// Edge Function endpoint — keeps bot token & admin PIN on the server (not in this code)
const API_FN = SUPABASE_URL + "/functions/v1/dynamic-worker";

// Sends a Telegram message via the Edge Function (browser can't call Telegram directly — CORS)
const sendBotMessage = async (chatId, text) => {
  try {
    await fetch(API_FN, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + SUPABASE_KEY },
      body: JSON.stringify({ action: "send", chat_id: chatId, text }),
    });
  } catch(e) { console.error("Bot notify failed:", e); }
};

// Verifies admin PIN against the server (PIN is never stored in this code)
const checkAdminPin = async (pin) => {
  try {
    const res = await fetch(API_FN, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + SUPABASE_KEY },
      body: JSON.stringify({ action: "check_pin", pin }),
    });
    const data = await res.json();
    return data.ok === true;
  } catch(e) { console.error("PIN check failed:", e); return false; }
};

const sb = {
  from: (table) => ({
    _table: table,
    _filters: [],
    _order: null,
    _limit: null,
    select(cols="*") { return {...this, _select: cols, _method:"select"}; },
    insert(data) { return {...this, _data: data, _method:"insert"}; },
    update(data) { return {...this, _data: data, _method:"update"}; },
    delete() { return {...this, _method:"delete"}; },
    eq(col, val) { return {...this, _filters:[...this._filters, {col,val,op:"eq"}]}; },
    order(col, {ascending=true}={}) { return {...this, _order:{col,ascending}}; },
    limit(n) { return {...this, _limit:n}; },
    single() { return {...this, _single:true}; },
    async then(resolve, reject) {
      try {
        const headers = {
          "Content-Type":"application/json",
          "apikey": SUPABASE_KEY,
          "Authorization": "Bearer " + SUPABASE_KEY,
          "Prefer": this._method==="insert" ? "return=representation" : "",
        };
        let url = SUPABASE_URL + "/rest/v1/" + this._table;
        if (this._select) url += "?select=" + this._select;
        if (this._filters.length) {
          const sep = url.includes("?") ? "&" : "?";
          url += sep + this._filters.map(f => f.col + "=eq." + encodeURIComponent(f.val)).join("&");
        }
        if (this._order) {
          const sep = url.includes("?") ? "&" : "?";
          url += sep + "order=" + this._order.col + "." + (this._order.ascending?"asc":"desc");
        }
        if (this._limit) {
          const sep = url.includes("?") ? "&" : "?";
          url += sep + "limit=" + this._limit;
        }
        if (this._single) headers["Accept"] = "application/vnd.pgrst.object+json";

        const method = {select:"GET",insert:"POST",update:"PATCH",delete:"DELETE"}[this._method||"select"];
        const res = await fetch(url, {
          method,
          headers,
          body: this._data ? JSON.stringify(this._data) : undefined,
        });
        if (!res.ok) {
          const err = await res.json().catch(()=>({}));
          resolve({data:null, error: err});
          return;
        }
        const data = method==="DELETE" ? null : await res.json().catch(()=>null);
        resolve({data, error:null});
      } catch(e) {
        resolve({data:null, error:e});
      }
    }
  }),
  rpc: async (fn, params={}) => {
    const res = await fetch(SUPABASE_URL + "/rest/v1/rpc/" + fn, {
      method:"POST",
      headers:{"Content-Type":"application/json","apikey":SUPABASE_KEY,"Authorization":"Bearer "+SUPABASE_KEY},
      body: JSON.stringify(params),
    });
    const data = await res.json().catch(()=>null);
    return {data, error: res.ok ? null : data};
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// TELEGRAM USER
// ─────────────────────────────────────────────────────────────────────────────
const getTgUser = () => {
  const tg = window.Telegram?.WebApp?.initDataUnsafe?.user;
  if (tg) return { id: tg.id, first_name: tg.first_name || "Игрок", username: tg.username || "" };
  // Dev fallback — random id so multiple testers work
  const devId = parseInt(localStorage.getItem("dev_tg_id") || String(100000 + Math.floor(Math.random()*900000)));
  localStorage.setItem("dev_tg_id", String(devId));
  return { id: devId, first_name: "Игрок_" + String(devId).slice(-3), username: "" };
};

// ─────────────────────────────────────────────────────────────────────────────
// GLOBAL STYLES
// ─────────────────────────────────────────────────────────────────────────────
const GlobalStyle = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Oswald:wght@400;600;700&family=Inter:wght@400;500;600;700&display=swap');
    * { margin:0; padding:0; box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
    body { background:#080d08; overflow:hidden; }
    select option { background:#0d1a0d; color:#e8ffe8; }
    ::-webkit-scrollbar { width:3px; }
    ::-webkit-scrollbar-track { background:transparent; }
    ::-webkit-scrollbar-thumb { background:rgba(57,255,20,0.3); border-radius:3px; }
    textarea { resize:none; }
    @keyframes glitch {
      0%,92%,100% { clip-path:none; transform:none; }
      93% { clip-path:inset(20% 0 60% 0); transform:translate(-3px,0); }
      95% { clip-path:inset(60% 0 10% 0); transform:translate(3px,0); }
      97% { clip-path:inset(40% 0 30% 0); transform:translate(-2px,0); }
    }
    @keyframes flicker {
      0%,96%,100%{opacity:1} 97%{opacity:0.7} 98%{opacity:1} 99%{opacity:0.85}
    }
    @keyframes slideUp {
      from{transform:translateY(16px);opacity:0} to{transform:translateY(0);opacity:1}
    }
    @keyframes pulse {
      0%,100%{box-shadow:0 0 0 0 rgba(57,255,20,0)}
      50%{box-shadow:0 0 0 5px rgba(57,255,20,0.12)}
    }
    @keyframes blink {
      0%,100%{opacity:1} 50%{opacity:0}
    }
    @keyframes msgIn {
      from{transform:translateY(8px);opacity:0} to{transform:translateY(0);opacity:1}
    }
    .glitch { animation:glitch 7s infinite; }
    .flicker { animation:flicker 4s infinite; }
    .slide-up { animation:slideUp 0.25s ease forwards; }
    .blink { animation:blink 1s infinite; }
    .msg-in { animation:msgIn 0.2s ease forwards; }
  `}</style>
);

// ─────────────────────────────────────────────────────────────────────────────
// PALETTE & CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const C = {
  neon:"#39FF14", neonDim:"#2BC10E",
  neonGlow:"rgba(57,255,20,0.16)", neonBorder:"rgba(57,255,20,0.25)",
  bg:"#080d08", card:"#0d150d", card2:"#101a10",
  text:"#E8FFE8", muted:"#6b8f6b",
  red:"#FF2D2D", yellow:"#FFD600", purple:"#B026FF", cyan:"#00E5FF",
};

// ─────────────────────────────────────────────────────────────────────────────
// DATA
// ─────────────────────────────────────────────────────────────────────────────
const COMPUTERS = Array.from({length:20},(_,i)=>{
  const forced={0:"available",3:"available",7:"available",11:"available",15:"available",19:"available",1:"reserved",8:"reserved"};
  const fallback=["busy","busy","busy","busy","reserved"][i%5];
  return {
    id:i+1, zone:i<4?"VIP":i<16?"STANDARD":"BUDGET",
    spec:i<4?"RTX 4090 · i9-14900K · 32GB · 240Hz":i<16?"RTX 4070 · i7-13700K · 16GB · 165Hz":"RTX 3060 · i5-12600K · 16GB · 144Hz",
    status:forced[i]??fallback,
    timeLeft:forced[i]==="available"||forced[i]==="reserved"?null:Math.floor(Math.random()*90)+15,
    game:["CS2","Dota 2","Valorant","FC 26","Apex"][i%5],
  };
});

const TARIFFS=[
  {name:"УТРО",hours:"06:00–13:00",std:25,vip:35,tag:"ВЫГОДНО"},
  {name:"ДЕНЬ",hours:"13:00–18:00",std:30,vip:40,tag:null},
  {name:"ВЕЧЕР",hours:"18:00–00:00",std:35,vip:45,tag:"ПОПУЛЯРНО"},
  {name:"НОЧЬ",hours:"00:00–06:00",std:25,vip:30,tag:"ДЁШЕВО"},
];

const EVENTS=[
  {title:"FC 26 ТУРНИР",date:"22 ИЮНЯ",prize:"БЕСПЛАТНЫЙ",sub:"Старт 10:00",color:C.neon,emoji:"⚽"},
  {title:"CS2 NIGHT CUP",date:"28 ИЮНЯ",prize:"15 000 ₽",sub:"Старт 20:00",color:C.yellow,emoji:"🔫"},
  {title:"DOTA 2 КУБОК",date:"5 ИЮЛЯ",prize:"10 000 ₽",sub:"Старт 12:00",color:C.purple,emoji:"🛡️"},
];

const LEADERS=[
  {name:"ВЛАД_PRO",hours:312,game:"CS2",rank:1},
  {name:"СЕРЁГА",hours:289,game:"Dota 2",rank:2},
  {name:"АРТЁМ",hours:241,game:"Valorant",rank:3},
  {name:"НИКИТА",hours:198,game:"Apex",rank:4},
  {name:"МАКС",hours:177,game:"CS2",rank:5},
];

const MENU_CATS_DEFAULT=[
  {id:"drinks",label:"🥤 НАПИТКИ",items:[
    {id:"d1",name:"Энергетик Monster",price:120,emoji:"⚡",desc:"330мл"},
    {id:"d2",name:"Энергетик Burn",price:100,emoji:"🔥",desc:"330мл"},
    {id:"d3",name:"Кофе Americano",price:80,emoji:"☕",desc:"Двойной"},
    {id:"d4",name:"Кофе Капучино",price:100,emoji:"☕",desc:"250мл"},
    {id:"d5",name:"Кола / Пепси",price:70,emoji:"🥤",desc:"0.5л"},
    {id:"d6",name:"Вода",price:40,emoji:"💧",desc:"0.5л"},
  ]},
  {id:"food",label:"🍔 ЕДА",items:[
    {id:"f1",name:"Бургер Classic",price:250,emoji:"🍔",desc:"Говядина, сыр, соус"},
    {id:"f2",name:"Хот-дог",price:150,emoji:"🌭",desc:"С горчицей"},
    {id:"f3",name:"Пицца (кусок)",price:130,emoji:"🍕",desc:"Маргарита / Пепперони"},
    {id:"f4",name:"Картошка фри",price:90,emoji:"🍟",desc:"Большая порция"},
    {id:"f5",name:"Наггетсы 6шт",price:120,emoji:"🍗",desc:"С соусом"},
  ]},
  {id:"snacks",label:"🍫 СНЕКИ",items:[
    {id:"s1",name:"Чипсы Lay's",price:90,emoji:"🥔",desc:"Большая пачка"},
    {id:"s2",name:"Сухарики",price:60,emoji:"🧄",desc:"Пачка"},
    {id:"s3",name:"Шоколадка",price:80,emoji:"🍫",desc:"Twix / Snickers"},
    {id:"s4",name:"Жвачка",price:30,emoji:"🍬",desc:"Пачка"},
  ]},
];

const ST={
  available:{color:C.neon,label:"СВОБОДНО",bg:"rgba(57,255,20,0.07)"},
  busy:{color:C.red,label:"ЗАНЯТО",bg:"rgba(255,45,45,0.07)"},
  reserved:{color:C.yellow,label:"РЕЗЕРВ",bg:"rgba(255,214,0,0.07)"},
};

// ─────────────────────────────────────────────────────────────────────────────
// SHARED UI ATOMS
// ─────────────────────────────────────────────────────────────────────────────
function SectionHead({label,color}){
  const col=color||C.neon;
  return(
    <div style={{display:"flex",alignItems:"center",gap:10,margin:"18px 0 12px"}}>
      <div style={{width:3,height:18,background:col,boxShadow:`0 0 8px ${col}`,borderRadius:2,flexShrink:0}}/>
      <span style={{fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:12,letterSpacing:"0.18em",color:col}}>{label}</span>
      <div style={{flex:1,height:1,background:`linear-gradient(90deg,${col}40,transparent)`}}/>
    </div>
  );
}

function Logo({balance,onBalanceTap}){
  return(
    <div style={{
      padding:"14px 18px 12px",
      borderBottom:`1px solid ${C.neonBorder}`,
      display:"flex",alignItems:"center",justifyContent:"space-between",
      background:"rgba(57,255,20,0.02)",flexShrink:0,
    }}>
      <div>
        <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:30,lineHeight:0.95,letterSpacing:"0.04em",color:C.text}} className="glitch">
          <span style={{color:C.neon}}>LEVEL</span> UP
        </div>
        <div style={{fontFamily:"'Oswald',sans-serif",fontSize:9,color:C.muted,letterSpacing:"0.2em",marginTop:1}}>COMPUTER CLUB · ОРША</div>
      </div>
      <button onClick={onBalanceTap} style={{
        background:"rgba(57,255,20,0.08)",border:`1px solid ${C.neonBorder}`,
        borderRadius:12,padding:"8px 14px",cursor:"pointer",textAlign:"right",
      }}>
        <div style={{fontFamily:"'Oswald',sans-serif",fontSize:9,color:C.muted,letterSpacing:"0.15em"}}>БАЛАНС</div>
        <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,color:C.neon,lineHeight:1,textShadow:`0 0 10px ${C.neonGlow}`}}>
          {balance} РУБ
        </div>
      </button>
    </div>
  );
}

function NeonBtn({onClick,children,color,disabled,style={}}){
  const col=color||C.neon;
  return(
    <button onClick={onClick} disabled={disabled} style={{
      width:"100%",
      background:disabled?"rgba(57,255,20,0.04)":`linear-gradient(90deg,rgba(57,255,20,0.12),rgba(57,255,20,0.06))`,
      border:`1px solid ${disabled?"rgba(57,255,20,0.12)":col+"60"}`,
      borderRadius:12,padding:"14px",
      fontFamily:"'Bebas Neue',sans-serif",fontSize:20,letterSpacing:"0.08em",
      color:disabled?C.muted:col,cursor:disabled?"default":"pointer",
      boxShadow:disabled?"none":`0 0 18px rgba(57,255,20,0.15)`,
      textShadow:disabled?"none":`0 0 8px ${col}`,
      transition:"all 0.15s",...style,
    }}>{children}</button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NAV
// ─────────────────────────────────────────────────────────────────────────────
function BottomNav({active,onChange,chatUnread}){
  const tabs=[
    {id:"map",icon:"🗺",label:"ЗАЛ"},
    {id:"book",icon:"⚡",label:"БРОНЬ"},
    {id:"menu",icon:"🍔",label:"МЕНЮ"},
    {id:"chat",icon:"💬",label:"ЧАТ"},
    {id:"profile",icon:"👾",label:"Я"},
  ];
  return(
    <nav style={{
      position:"absolute",bottom:0,left:0,right:0,zIndex:200,
      background:"rgba(8,13,8,0.97)",borderTop:`1px solid ${C.neonBorder}`,
      backdropFilter:"blur(16px)",display:"flex",
    }}>
      {tabs.map(t=>{
        const isActive=active===t.id;
        const hasBadge=t.id==="chat"&&chatUnread>0;
        return(
          <button key={t.id} onClick={()=>onChange(t.id)} style={{
            flex:1,border:"none",background:"none",padding:"10px 0 8px",
            display:"flex",flexDirection:"column",alignItems:"center",gap:3,
            cursor:"pointer",position:"relative",
          }}>
            {isActive&&<div style={{position:"absolute",top:0,left:"20%",right:"20%",height:2,background:C.neon,boxShadow:`0 0 8px ${C.neon}`}}/>}
            <div style={{position:"relative"}}>
              <span style={{fontSize:18,filter:isActive?`drop-shadow(0 0 5px ${C.neon})`:"grayscale(1) opacity(0.4)"}}>{t.icon}</span>
              {hasBadge&&<div style={{position:"absolute",top:-4,right:-6,width:16,height:16,borderRadius:"50%",background:C.red,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:"#fff",fontWeight:700}}>{chatUnread}</div>}
            </div>
            <span style={{fontFamily:"'Oswald',sans-serif",fontSize:9,letterSpacing:"0.1em",color:isActive?C.neon:C.muted}}>{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAP SCREEN — loads computers + bookings from Supabase
// ─────────────────────────────────────────────────────────────────────────────
function MapScreen({onBook,computers,zones,bookings}){
  const [sel,setSel]=useState(null);

  // Compute live status: busy if active booking now, reserved if future booking
  const now=new Date();
  const enriched=(computers||[]).map(pc=>{
    const pcBookings=(bookings||[]).filter(b=>b.pc_number===pc.number&&b.status!=="cancelled"&&b.status!=="done");
    const active=pcBookings.find(b=>new Date(b.starts_at)<=now&&new Date(b.ends_at)>now);
    const upcoming=pcBookings.find(b=>new Date(b.starts_at)>now);
    let status=pc.status==="off"?"off":active?"busy":upcoming?"reserved":"available";
    const minutesLeft=active?Math.floor((new Date(active.ends_at)-now)/60000):null;
    return {...pc, liveStatus:status, minutesLeft};
  });

  const free=enriched.filter(c=>c.liveStatus==="available").length;
  const busy=enriched.filter(c=>c.liveStatus==="busy").length;
  const reserved=enriched.filter(c=>c.liveStatus==="reserved").length;
  const selPC=enriched.find(c=>c.id===sel);

  const getS=(status)=>ST[status]||ST.available;

  return(
    <div style={{padding:"0 18px",overflowY:"auto",flex:1}}>
      <div style={{display:"flex",gap:8,marginTop:16}}>
        {[{val:free,label:"СВОБ",color:C.neon},{val:busy,label:"ЗАНЯТО",color:C.red},{val:reserved,label:"РЕЗЕРВ",color:C.yellow}].map(s=>(
          <div key={s.label} style={{flex:1,background:`${s.color}10`,border:`1px solid ${s.color}30`,borderRadius:12,padding:"10px 8px",position:"relative",overflow:"hidden",textAlign:"center"}}>
            <div style={{position:"absolute",top:0,left:0,right:0,height:2,background:s.color}}/>
            <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:34,color:s.color,lineHeight:1}}>{s.val}</div>
            <div style={{fontFamily:"'Oswald',sans-serif",fontSize:9,color:C.muted,letterSpacing:"0.1em",marginTop:2}}>{s.label}</div>
          </div>
        ))}
      </div>
      <div style={{display:"flex",gap:14,marginTop:10}}>
        {Object.entries(ST).map(([k,v])=>(
          <div key={k} style={{display:"flex",alignItems:"center",gap:5}}>
            <div style={{width:8,height:8,background:v.color,borderRadius:2}}/>
            <span style={{fontFamily:"'Oswald',sans-serif",fontSize:9,color:C.muted,letterSpacing:"0.1em"}}>{v.label}</span>
          </div>
        ))}
      </div>

      {(zones||[]).map(zone=>{
        const pcs=enriched.filter(c=>c.zone_id===zone.id);
        if(!pcs.length)return null;
        return(
          <div key={zone.id}>
            <SectionHead label={zone.name} color={zone.color||C.neon}/>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
              {pcs.map(pc=>{
                const s=getS(pc.liveStatus); const isS=sel===pc.id;
                const canSelect=pc.liveStatus==="available";
                return(
                  <button key={pc.id} onClick={()=>canSelect&&setSel(isS?null:pc.id)}
                    style={{border:`1.5px solid ${isS?s.color:s.color+"40"}`,borderRadius:10,background:isS?s.bg+"cc":s.bg,
                      padding:"10px 4px 8px",cursor:canSelect?"pointer":"default",
                      display:"flex",flexDirection:"column",alignItems:"center",gap:3,transition:"all 0.15s",
                      boxShadow:isS?`0 0 14px ${s.color}50`:"none",opacity:pc.liveStatus==="off"?0.4:1}}>
                    <span style={{fontSize:17}}>{zone.name==="PLAYSTATION"?"🎮":"🖥"}</span>
                    <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:14,color:s.color,lineHeight:1}}>#{pc.number}</span>
                    <span style={{fontFamily:"'Inter',sans-serif",fontSize:9,color:C.muted}}>{pc.minutesLeft?`${pc.minutesLeft}м`:"···"}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {selPC&&(
        <div className="slide-up" style={{marginTop:18,background:C.card,border:`1px solid ${C.neonBorder}`,borderRadius:16,padding:18,position:"relative",overflow:"hidden",boxShadow:`0 0 28px ${C.neonGlow}`}}>
          <div style={{position:"absolute",top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,${C.neon},transparent)`}}/>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
            <div>
              <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:26,color:C.text,lineHeight:1}}>ПК <span style={{color:C.neon}}>#{selPC.number}</span></div>
              <div style={{fontFamily:"'Oswald',sans-serif",fontSize:10,color:C.muted,marginTop:3}}>{(zones||[]).find(z=>z.id===selPC.zone_id)?.name} ZONE</div>
            </div>
            <div style={{fontFamily:"'Oswald',sans-serif",fontSize:10,color:getS(selPC.liveStatus).color,background:getS(selPC.liveStatus).bg,border:`1px solid ${getS(selPC.liveStatus).color}50`,padding:"4px 12px",borderRadius:20,fontWeight:700}}>{getS(selPC.liveStatus).label}</div>
          </div>
          <div style={{fontFamily:"'Inter',sans-serif",fontSize:11,color:C.muted,marginBottom:14,lineHeight:1.5}}>{selPC.spec}</div>
          <NeonBtn onClick={()=>onBook(selPC)}>ЗАБРОНИРОВАТЬ →</NeonBtn>
        </div>
      )}
      <div style={{height:90}}/>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BOOK SCREEN — real bookings with conflict check
// ─────────────────────────────────────────────────────────────────────────────
function BookScreen({preSelected,onSessionBooked,onBookingCreated,computers,zones,bookings,user}){
  const [pcId,setPcId]=useState(preSelected?.id||"");
  const [date,setDate]=useState(()=>new Date().toISOString().slice(0,10));
  const [time,setTime]=useState("");
  const [hours,setHours]=useState("2");
  const [done,setDone]=useState(false);
  const [loading,setLoading]=useState(false);
  const [conflict,setConflict]=useState(false);
  const [bookedInfo,setBookedInfo]=useState(null);

  const availablePCs=(computers||[]).filter(c=>c.status!=="off");
  const ready=pcId&&date&&time;
  const price=parseInt(hours)*30;

  // Check for booking conflicts
  useEffect(()=>{
    if(!pcId||!date||!time)return;
    const starts=new Date(`${date}T${time}`);
    const ends=new Date(starts.getTime()+parseInt(hours)*3600000);
    const hasConflict=(bookings||[]).some(b=>
      b.computer_id===pcId&&
      b.status!=="cancelled"&&b.status!=="done"&&
      new Date(b.starts_at)<ends&&new Date(b.ends_at)>starts
    );
    setConflict(hasConflict);
  },[pcId,date,time,hours,bookings]);

  const handleBook=async()=>{
    if(!ready||loading||conflict||!user)return;
    setLoading(true);
    const starts=new Date(`${date}T${time}`);
    const ends=new Date(starts.getTime()+parseInt(hours)*3600000);
    const pc=(computers||[]).find(c=>c.id===pcId);
    await sb.from("bookings").insert({
      user_id:user.id,
      computer_id:pcId,
      pc_number:pc?.number||0,
      starts_at:starts.toISOString(),
      ends_at:ends.toISOString(),
      duration_hours:parseInt(hours),
      status:"pending",
    });
    const now=new Date();
    if(starts<=now&&ends>now){
      // Starts now — activate immediately + send TG confirmation
      await onSessionBooked(pc?.number||0,parseInt(hours),starts,ends);
    } else {
      // Future booking — send confirmation + schedule reminder
      await onBookingCreated(pc?.number||0,parseInt(hours),starts);
    }
    setBookedInfo({pc:pc?.number||0,date,time,hours,price});
    setLoading(false);
    setDone(true);
  };

  const inp={width:"100%",background:C.card,border:`1px solid ${C.neonBorder}`,borderRadius:10,padding:"12px 14px",color:C.text,fontSize:14,fontFamily:"'Inter',sans-serif",outline:"none",colorScheme:"dark"};
  const lbl={fontFamily:"'Oswald',sans-serif",fontSize:10,letterSpacing:"0.18em",color:C.muted,display:"block",marginBottom:6};

  if(done&&bookedInfo) return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flex:1,padding:24,textAlign:"center"}}>
      <div style={{fontSize:64,filter:`drop-shadow(0 0 20px ${C.neon})`,marginBottom:16}}>✅</div>
      <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:34,color:C.neon,letterSpacing:"0.05em",textShadow:`0 0 18px ${C.neonGlow}`,marginBottom:8}}>БРОНЬ ПРИНЯТА!</div>
      <div style={{fontFamily:"'Oswald',sans-serif",fontSize:14,color:C.muted,lineHeight:1.8,marginBottom:20}}>
        ПК #{bookedInfo.pc} · {bookedInfo.date} · {bookedInfo.time}<br/>
        <span style={{color:C.neon,fontSize:22,fontFamily:"'Bebas Neue',sans-serif"}}>{bookedInfo.hours} ЧАС · {bookedInfo.price} РУБ</span>
      </div>
      <div style={{background:C.card,border:`1px solid ${C.neonBorder}`,borderRadius:14,padding:16,fontSize:12,color:C.muted,lineHeight:1.7,marginBottom:20,fontFamily:"'Inter',sans-serif"}}>
        🔔 Напоминание придёт за 30 минут до начала<br/>
        Покажи этот экран на стойке 👾
      </div>
      <button onClick={()=>{setDone(false);setPcId("");setTime("");}} style={{background:"transparent",border:`1px solid ${C.neonBorder}`,borderRadius:10,padding:"11px 28px",color:C.neon,cursor:"pointer",fontFamily:"'Oswald',sans-serif",fontSize:13,letterSpacing:"0.1em"}}>← НОВАЯ БРОНЬ</button>
    </div>
  );

  return(
    <div style={{padding:"0 18px",overflowY:"auto",flex:1}}>
      {preSelected&&(
        <div style={{marginTop:16,background:"rgba(57,255,20,0.07)",border:`1px solid ${C.neonBorder}`,borderRadius:12,padding:"12px 16px",display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontSize:22}}>🖥</span>
          <div>
            <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:18,color:C.neon}}>ПК #{preSelected.number} ВЫБРАН</div>
            <div style={{fontFamily:"'Inter',sans-serif",fontSize:10,color:C.muted}}>{preSelected.spec}</div>
          </div>
        </div>
      )}
      <SectionHead label="ВЫБОР КОМПЬЮТЕРА"/>
      <select value={pcId} onChange={e=>setPcId(e.target.value)} style={{...inp,appearance:"none",marginBottom:14}}>
        <option value="">Выбери ПК...</option>
        {availablePCs.map(c=>{
          const zone=(zones||[]).find(z=>z.id===c.zone_id);
          return <option key={c.id} value={c.id}>ПК #{c.number} — {zone?.name||""} — {(c.spec||"").split("·")[0].trim()}</option>;
        })}
      </select>
      <SectionHead label="ВРЕМЯ СЕССИИ"/>
      <label style={lbl}>ДАТА</label>
      <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={{...inp,marginBottom:12}}/>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <div><label style={lbl}>НАЧАЛО</label><input type="time" value={time} onChange={e=>setTime(e.target.value)} style={inp}/></div>
        <div><label style={lbl}>ЧАСОВ</label>
          <select value={hours} onChange={e=>setHours(e.target.value)} style={{...inp,appearance:"none"}}>
            {[1,2,3,4,5,6,8,10,12].map(h=><option key={h} value={h}>{h} ч. · {h*30} руб</option>)}
          </select>
        </div>
      </div>

      {/* Availability timeline for selected PC + date */}
      {pcId&&(
        <div style={{marginTop:14}}>
          <label style={lbl}>ЗАНЯТОСТЬ НА {new Date(date).toLocaleDateString("ru",{day:"numeric",month:"short"})}</label>
          <div style={{background:C.card,border:`1px solid ${C.neonBorder}`,borderRadius:12,padding:"14px 12px 10px"}}>
            <div style={{display:"flex",gap:2}}>
              {Array.from({length:24},(_,h)=>{
                // Is this hour booked by someone?
                const hourStart=new Date(`${date}T${String(h).padStart(2,"0")}:00`);
                const hourEnd=new Date(hourStart.getTime()+3600000);
                const isBooked=(bookings||[]).some(b=>
                  b.computer_id===pcId&&b.status!=="cancelled"&&b.status!=="done"&&
                  new Date(b.starts_at)<hourEnd&&new Date(b.ends_at)>hourStart
                );
                // Is this hour part of my current selection?
                let isMine=false;
                if(time){
                  const myStart=new Date(`${date}T${time}`);
                  const myEnd=new Date(myStart.getTime()+parseInt(hours)*3600000);
                  isMine=myStart<hourEnd&&myEnd>hourStart;
                }
                const isPast=hourEnd<new Date();
                const color=isBooked?C.red:isMine?C.neon:isPast?"#2a2a2a":"rgba(57,255,20,0.15)";
                return(
                  <div key={h} title={`${h}:00`} onClick={()=>{if(!isBooked&&!isPast)setTime(`${String(h).padStart(2,"0")}:00`);}}
                    style={{flex:1,height:32,borderRadius:3,background:color,cursor:isBooked||isPast?"default":"pointer",
                      boxShadow:isMine?`0 0 8px ${C.neon}`:isBooked?`0 0 6px ${C.red}80`:"none",
                      transition:"all 0.15s",position:"relative"}}/>
                );
              })}
            </div>
            {/* Hour labels every 6h */}
            <div style={{display:"flex",justifyContent:"space-between",marginTop:6,fontFamily:"'Inter',sans-serif",fontSize:9,color:C.muted}}>
              <span>00</span><span>06</span><span>12</span><span>18</span><span>24</span>
            </div>
            {/* Legend */}
            <div style={{display:"flex",gap:14,marginTop:10,justifyContent:"center"}}>
              {[["rgba(57,255,20,0.15)","свободно"],[C.red,"занято"],[C.neon,"твоя бронь"]].map(([col,lbl])=>(
                <div key={lbl} style={{display:"flex",alignItems:"center",gap:5}}>
                  <div style={{width:10,height:10,borderRadius:2,background:col,boxShadow:col===C.neon||col===C.red?`0 0 4px ${col}`:"none"}}/>
                  <span style={{fontFamily:"'Inter',sans-serif",fontSize:10,color:C.muted}}>{lbl}</span>
                </div>
              ))}
            </div>
            <div style={{fontFamily:"'Inter',sans-serif",fontSize:9,color:C.muted,textAlign:"center",marginTop:8}}>Нажми на свободный час чтобы выбрать время</div>
          </div>
        </div>
      )}

      {conflict&&<div style={{marginTop:12,background:"rgba(255,45,45,0.1)",border:"1px solid rgba(255,45,45,0.3)",borderRadius:10,padding:"10px 14px",fontFamily:"'Inter',sans-serif",fontSize:12,color:C.red}}>⚠️ Этот компьютер уже забронирован на выбранное время</div>}
      {ready&&!conflict&&(
        <div className="slide-up" style={{marginTop:16,background:"rgba(57,255,20,0.06)",border:`1px solid ${C.neonBorder}`,borderRadius:12,padding:"14px 18px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontFamily:"'Oswald',sans-serif",fontSize:10,color:C.muted,letterSpacing:"0.1em"}}>К ОПЛАТЕ</div>
            <div style={{fontFamily:"'Inter',sans-serif",fontSize:11,color:C.muted,marginTop:2}}>{hours} ч. × 30 руб/ч</div>
          </div>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:32,color:C.neon,textShadow:`0 0 12px ${C.neonGlow}`}}>{price} РУБ</div>
        </div>
      )}
      <div style={{marginTop:16}}>
        <NeonBtn onClick={handleBook} disabled={!ready||loading||conflict}>
          {loading?"БРОНИРУЕМ...":"ПОДТВЕРДИТЬ БРОНЬ"}
        </NeonBtn>
      </div>
      <div style={{fontFamily:"'Inter',sans-serif",textAlign:"center",fontSize:11,color:C.muted,marginTop:10}}>Отмена бесплатно за 1 час до начала</div>
      <div style={{height:90}}/>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MENU SCREEN
// ─────────────────────────────────────────────────────────────────────────────
function MenuScreen({balance,onBalanceChange,onOrderNotify,menuCats,activeSession}){
  const [cat,setCat]=useState("drinks");
  const [cart,setCart]=useState({});
  const [payMethod,setPayMethod]=useState("balance"); // "balance" | "cash"
  const [orderDone,setOrderDone]=useState(false);
  const [showCart,setShowCart]=useState(false);
  const myPC=activeSession?.pc_number||null;

  const addItem=(id)=>setCart(c=>({...c,[id]:(c[id]||0)+1}));
  const removeItem=(id)=>setCart(c=>{const n={...c};if(n[id]>1)n[id]--;else delete n[id];return n;});
  const cartCount=Object.values(cart).reduce((a,b)=>a+b,0);
  const cartTotal=Object.entries(cart).reduce((sum,[id,qty])=>{
    const item=menuCats.flatMap(c=>c.items).find(i=>i.id===id);
    return sum+(item?item.price*qty:0);
  },0);

  const currentCat=menuCats.find(c=>c.id===cat);

  const [confirmedTotal,setConfirmedTotal]=useState(0);
  const confirmOrder=()=>{
    if(payMethod==="balance"&&balance<cartTotal)return;
    const total=cartTotal;
    setConfirmedTotal(total);
    const cartItems=Object.entries(cart).map(([id,qty])=>{
      const item=menuCats.flatMap(cat=>cat.items).find(i=>i.id===id);
      return item?{name:item.name,emoji:item.emoji,price:item.price,qty}:null;
    }).filter(Boolean);
    if(payMethod==="balance")onBalanceChange(-total);
    onOrderNotify(myPC,total,payMethod,cartItems);
    setCart({});setShowCart(false);setOrderDone(true);
    setTimeout(()=>setOrderDone(false),5000);
  };

  if(orderDone) return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flex:1,padding:24,textAlign:"center"}}>
      <div style={{fontSize:64,marginBottom:16,filter:`drop-shadow(0 0 16px ${C.neon})`}}>🛵</div>
      <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:32,color:C.neon,letterSpacing:"0.05em",marginBottom:8,textShadow:`0 0 18px ${C.neonGlow}`}}>ЗАКАЗ ПРИНЯТ!</div>
      <div style={{fontFamily:"'Oswald',sans-serif",fontSize:14,color:C.muted,lineHeight:1.8}}>
        Принесём прямо к ПК #{myPC}<br/>
        <span style={{color:C.neon}}>Ожидай 5–10 минут</span>
      </div>
      {payMethod==="balance"&&<div style={{marginTop:12,fontFamily:"'Oswald',sans-serif",fontSize:12,color:C.muted}}>Списано с баланса: <span style={{color:C.yellow}}>{confirmedTotal} руб</span></div>}
      {payMethod==="cash"&&<div style={{marginTop:12,fontFamily:"'Oswald',sans-serif",fontSize:12,color:C.muted}}>Оплата наличными при получении: <span style={{color:C.yellow}}>{confirmedTotal} руб</span></div>}
      {!myPC&&<div style={{marginTop:12,background:"rgba(255,214,0,0.1)",border:"1px solid rgba(255,214,0,0.3)",borderRadius:10,padding:"10px 14px",fontFamily:"'Inter',sans-serif",fontSize:12,color:C.yellow}}>⚠️ У тебя нет активной сессии. Забронируй ПК во вкладке ⚡</div>}
    </div>
  );

  // Cart overlay
  if(showCart) return(
    <div style={{display:"flex",flexDirection:"column",flex:1,overflowY:"auto"}}>
      <div style={{padding:"16px 18px 0",display:"flex",alignItems:"center",gap:12}}>
        <button onClick={()=>setShowCart(false)} style={{background:"transparent",border:`1px solid ${C.neonBorder}`,borderRadius:8,padding:"6px 14px",color:C.neon,cursor:"pointer",fontFamily:"'Oswald',sans-serif",fontSize:12,letterSpacing:"0.1em"}}>← НАЗАД</button>
        <SectionHead label="КОРЗИНА"/>
      </div>
      <div style={{padding:"0 18px",flex:1,overflowY:"auto"}}>
        {Object.entries(cart).map(([id,qty])=>{
          const item=menuCats.flatMap(c=>c.items).find(i=>i.id===id);
          if(!item)return null;
          return(
            <div key={id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 0",borderBottom:`1px solid rgba(57,255,20,0.08)`}}>
              <span style={{fontSize:22}}>{item.emoji}</span>
              <div style={{flex:1}}>
                <div style={{fontFamily:"'Oswald',sans-serif",fontSize:14,color:C.text,fontWeight:600}}>{item.name}</div>
                <div style={{fontFamily:"'Inter',sans-serif",fontSize:11,color:C.muted}}>{item.price} руб × {qty}</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <button onClick={()=>removeItem(id)} style={{width:28,height:28,borderRadius:"50%",background:"rgba(255,45,45,0.1)",border:"1px solid rgba(255,45,45,0.3)",color:C.red,cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
                <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:18,color:C.neon,minWidth:20,textAlign:"center"}}>{qty}</span>
                <button onClick={()=>addItem(id)} style={{width:28,height:28,borderRadius:"50%",background:C.neonGlow,border:`1px solid ${C.neonBorder}`,color:C.neon,cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
              </div>
              <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:16,color:C.neon,minWidth:56,textAlign:"right"}}>{item.price*qty} р</div>
            </div>
          );
        })}

        <SectionHead label="СПОСОБ ОПЛАТЫ"/>
        {[
          {id:"balance",label:"С баланса",sub:`Доступно: ${balance} руб`,icon:"💳",disabled:balance<cartTotal},
          {id:"cash",label:"Наличными",sub:"Оплатить при получении",icon:"💵",disabled:false},
        ].map(m=>(
          <button key={m.id} onClick={()=>!m.disabled&&setPayMethod(m.id)} style={{
            width:"100%",marginBottom:10,
            background:payMethod===m.id?"rgba(57,255,20,0.1)":C.card,
            border:`1.5px solid ${payMethod===m.id?C.neon:C.neonBorder}`,
            borderRadius:12,padding:"14px 16px",cursor:m.disabled?"default":"pointer",
            display:"flex",alignItems:"center",gap:14,opacity:m.disabled?0.4:1,
            textAlign:"left",
          }}>
            <span style={{fontSize:24}}>{m.icon}</span>
            <div style={{flex:1}}>
              <div style={{fontFamily:"'Oswald',sans-serif",fontSize:14,color:payMethod===m.id?C.neon:C.text,fontWeight:600}}>{m.label}</div>
              <div style={{fontFamily:"'Inter',sans-serif",fontSize:11,color:C.muted}}>{m.disabled&&m.id==="balance"?`Не хватает ${cartTotal-balance} руб`:m.sub}</div>
            </div>
            <div style={{width:20,height:20,borderRadius:"50%",border:`2px solid ${payMethod===m.id?C.neon:C.muted}`,display:"flex",alignItems:"center",justifyContent:"center"}}>
              {payMethod===m.id&&<div style={{width:10,height:10,borderRadius:"50%",background:C.neon}}/>}
            </div>
          </button>
        ))}

        <div style={{marginTop:8,background:C.card,border:`1px solid ${C.neonBorder}`,borderRadius:12,padding:"14px 18px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontFamily:"'Oswald',sans-serif",fontSize:10,color:C.muted,letterSpacing:"0.1em"}}>ИТОГО</div>
            <div style={{fontFamily:"'Inter',sans-serif",fontSize:11,color:C.muted,marginTop:2}}>Доставка к ПК #{myPC}</div>
          </div>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:30,color:C.neon,textShadow:`0 0 12px ${C.neonGlow}`}}>{cartTotal} РУБ</div>
        </div>
        <div style={{marginTop:12}}>
          <NeonBtn onClick={confirmOrder} disabled={payMethod==="balance"&&balance<cartTotal}>
            ЗАКАЗАТЬ 🛵
          </NeonBtn>
        </div>
      </div>
      <div style={{height:90}}/>
    </div>
  );

  return(
    <div style={{display:"flex",flexDirection:"column",flex:1,minHeight:0}}>
      {/* Cat tabs */}
      <div style={{display:"flex",gap:6,padding:"14px 18px 0",overflowX:"auto",flexShrink:0}}>
        {menuCats.map(c=>(
          <button key={c.id} onClick={()=>setCat(c.id)} style={{
            flexShrink:0,border:`1px solid ${cat===c.id?C.neon:C.neonBorder}`,
            borderRadius:20,padding:"7px 14px",
            background:cat===c.id?"rgba(57,255,20,0.12)":C.card,
            fontFamily:"'Oswald',sans-serif",fontSize:12,letterSpacing:"0.08em",
            color:cat===c.id?C.neon:C.muted,cursor:"pointer",
            boxShadow:cat===c.id?`0 0 10px ${C.neonGlow}`:"none",
            whiteSpace:"nowrap",
          }}>{c.label}</button>
        ))}
      </div>

      {/* delivery notice */}
      <div style={{margin:"12px 18px 0",background:"rgba(0,229,255,0.07)",border:"1px solid rgba(0,229,255,0.2)",borderRadius:10,padding:"10px 14px",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
        <span style={{fontSize:18}}>🛵</span>
        <span style={{fontFamily:"'Inter',sans-serif",fontSize:12,color:C.cyan}}>Доставляем прямо к твоему компьютеру · 5–10 мин</span>
      </div>

      {/* Items */}
      <div style={{flex:1,overflowY:"auto",padding:"0 18px"}}>
        <SectionHead label={currentCat.label}/>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {currentCat.items.map(item=>{
            const qty=cart[item.id]||0;
            return(
              <div key={item.id} style={{
                background:C.card,border:`1px solid ${qty>0?C.neonBorder:"rgba(57,255,20,0.1)"}`,
                borderRadius:14,padding:"14px 16px",
                display:"flex",alignItems:"center",gap:14,
                boxShadow:qty>0?`0 0 12px ${C.neonGlow}`:"none",
                transition:"all 0.15s",
              }}>
                <span style={{fontSize:28,flexShrink:0}}>{item.emoji}</span>
                <div style={{flex:1}}>
                  <div style={{fontFamily:"'Oswald',sans-serif",fontSize:15,color:C.text,fontWeight:600}}>{item.name}</div>
                  <div style={{fontFamily:"'Inter',sans-serif",fontSize:11,color:C.muted,marginTop:2}}>{item.desc}</div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:0,flexShrink:0}}>
                  <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:18,color:C.neon,marginRight:12}}>{item.price}<span style={{fontSize:12,color:C.muted}}> р</span></div>
                  {qty===0?(
                    <button onClick={()=>addItem(item.id)} style={{width:34,height:34,borderRadius:10,background:"rgba(57,255,20,0.1)",border:`1px solid ${C.neonBorder}`,color:C.neon,cursor:"pointer",fontSize:20,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 0 8px ${C.neonGlow}`}}>+</button>
                  ):(
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <button onClick={()=>removeItem(item.id)} style={{width:30,height:30,borderRadius:8,background:"rgba(255,45,45,0.1)",border:"1px solid rgba(255,45,45,0.3)",color:C.red,cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
                      <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:18,color:C.neon,minWidth:18,textAlign:"center"}}>{qty}</span>
                      <button onClick={()=>addItem(item.id)} style={{width:30,height:30,borderRadius:8,background:"rgba(57,255,20,0.1)",border:`1px solid ${C.neonBorder}`,color:C.neon,cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{height:cartCount>0?130:90}}/>
      </div>

      {/* Cart FAB */}
      {cartCount>0&&(
        <div style={{position:"absolute",bottom:72,left:18,right:18,zIndex:50}}>
          <button onClick={()=>setShowCart(true)} className="slide-up" style={{
            width:"100%",background:`linear-gradient(90deg,#1a4d00,#2d8500)`,
            border:`1px solid ${C.neon}60`,borderRadius:14,padding:"14px 20px",
            display:"flex",alignItems:"center",justifyContent:"space-between",
            cursor:"pointer",boxShadow:`0 0 24px rgba(57,255,20,0.3)`,
          }}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:16,color:C.neon,background:"rgba(57,255,20,0.2)",borderRadius:8,padding:"2px 10px"}}>{cartCount}</span>
              <span style={{fontFamily:"'Oswald',sans-serif",fontSize:14,color:C.text,letterSpacing:"0.08em"}}>КОРЗИНА</span>
            </div>
            <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,color:C.neon,textShadow:`0 0 10px ${C.neon}`}}>{cartTotal} РУБ →</span>
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED CHAT UI (used by both user ChatScreen and admin AdminChat)
// ─────────────────────────────────────────────────────────────────────────────
// Body without header — used standalone in admin (which has its own header)
function ChatUIBody({msgs,onSend,isAdmin,typing,quickReplies,noBottomMargin}){
  const [input,setInput]=useState("");
  const endRef=useRef(null);
  useEffect(()=>{endRef.current?.scrollIntoView({behavior:"smooth"});},[msgs,typing]);
  const send=()=>{if(!input.trim())return;onSend(input.trim());setInput("");};

  return(
    <>
      <div style={{flex:1,overflowY:"auto",padding:"14px 18px",display:"flex",flexDirection:"column",gap:10}}>
        {msgs.map(msg=>{
          const isMine = isAdmin ? msg.from==="admin" : msg.from==="user";
          const avatarEmoji = isAdmin ? "🎮" : "👾";
          return(
            <div key={msg.id} className="msg-in" style={{display:"flex",justifyContent:isMine?"flex-end":"flex-start"}}>
              {!isMine&&(
                <div style={{width:32,height:32,borderRadius:10,background:"linear-gradient(135deg,#1a4d00,#2d8500)",border:`1px solid ${C.neon}40`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,marginRight:8,flexShrink:0,alignSelf:"flex-end"}}>{avatarEmoji}</div>
              )}
              <div style={{maxWidth:"72%"}}>
                <div style={{background:isMine?`linear-gradient(135deg,#1a4d00,#2d8500)`:C.card,border:`1px solid ${isMine?C.neon+"50":C.neonBorder}`,borderRadius:isMine?"16px 16px 4px 16px":"16px 16px 16px 4px",padding:"10px 14px",boxShadow:isMine?`0 0 12px rgba(57,255,20,0.2)`:"none"}}>
                  <div style={{fontFamily:"'Inter',sans-serif",fontSize:14,color:C.text,lineHeight:1.5}}>{msg.text}</div>
                </div>
                <div style={{fontFamily:"'Inter',sans-serif",fontSize:10,color:C.muted,marginTop:3,textAlign:isMine?"right":"left"}}>{msg.time}</div>
              </div>
            </div>
          );
        })}
        {typing&&(
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:32,height:32,borderRadius:10,background:"linear-gradient(135deg,#1a4d00,#2d8500)",border:`1px solid ${C.neon}40`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>{isAdmin?"🎮":"👾"}</div>
            <div style={{background:C.card,border:`1px solid ${C.neonBorder}`,borderRadius:"16px 16px 16px 4px",padding:"10px 16px"}}>
              <div style={{display:"flex",gap:4}}>{[0,1,2].map(i=><div key={i} style={{width:7,height:7,borderRadius:"50%",background:C.neon,opacity:0.7,animation:`blink 1.2s ${i*0.3}s infinite`}}/>)}</div>
            </div>
          </div>
        )}
        <div ref={endRef}/>
      </div>
      {quickReplies&&(
        <div style={{padding:"8px 18px 6px",display:"flex",gap:6,overflowX:"auto",flexShrink:0}}>
          {quickReplies.map(q=>(
            <button key={q} onClick={()=>setInput(q)} style={{flexShrink:0,border:`1px solid ${C.neonBorder}`,borderRadius:20,padding:"5px 12px",background:C.card,fontFamily:"'Inter',sans-serif",fontSize:11,color:C.muted,cursor:"pointer",whiteSpace:"nowrap"}}>{q}</button>
          ))}
        </div>
      )}
      <div style={{padding:"8px 18px 12px",paddingBottom:noBottomMargin?"12px":"calc(12px + env(safe-area-inset-bottom))",display:"flex",gap:10,flexShrink:0,borderTop:`1px solid ${C.neonBorder}`,background:C.bg,marginBottom:noBottomMargin?0:58}}>
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()} placeholder={isAdmin?"Ответить игроку...":"Напиши сообщение..."} style={{flex:1,background:C.card,border:`1px solid ${C.neonBorder}`,borderRadius:12,padding:"12px 14px",color:C.text,fontSize:14,fontFamily:"'Inter',sans-serif",outline:"none"}}/>
        <button onClick={send} style={{width:46,height:46,borderRadius:12,background:`linear-gradient(135deg,#1a4d00,#2d8500)`,border:`1px solid ${C.neon}50`,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0,boxShadow:`0 0 12px ${C.neonGlow}`}}>➤</button>
      </div>
    </>
  );
}

// User-side chat with fixed admin header
function ChatUI({msgs,onSend,isAdmin,typing,quickReplies}){
  return(
    <div style={{display:"flex",flexDirection:"column",flex:1,minHeight:0}}>
      <div style={{padding:"12px 18px",borderBottom:`1px solid ${C.neonBorder}`,display:"flex",alignItems:"center",gap:12,flexShrink:0,background:"rgba(57,255,20,0.02)"}}>
        <div style={{width:42,height:42,borderRadius:12,background:"linear-gradient(135deg,#1a4d00,#2d8500)",border:`2px solid ${C.neon}50`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>🎮</div>
        <div>
          <div style={{fontFamily:"'Oswald',sans-serif",fontSize:15,color:C.text,fontWeight:700}}>LEVEL UP ADMIN</div>
          <div style={{display:"flex",alignItems:"center",gap:5,marginTop:2}}>
            <div style={{width:7,height:7,borderRadius:"50%",background:C.neon,boxShadow:`0 0 6px ${C.neon}`}} className="blink"/>
            <span style={{fontFamily:"'Inter',sans-serif",fontSize:11,color:C.neon}}>онлайн · обычно отвечает быстро</span>
          </div>
        </div>
      </div>
      <ChatUIBody msgs={msgs} onSend={onSend} isAdmin={isAdmin} typing={typing} quickReplies={quickReplies}/>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CHAT SCREEN (user side)
// ─────────────────────────────────────────────────────────────────────────────
function ChatScreen({msgs,onUserSend,onRead,adminTyping}){
  useEffect(()=>{onRead();},[]);
  return(
    <ChatUI
      msgs={msgs}
      onSend={onUserSend}
      isAdmin={false}
      typing={adminTyping}
      quickReplies={["Позови в зал 🔔","Нужна помощь","Когда освободится ПК?","Продлить время"]}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PROFILE SCREEN (with balance top-up)
// ─────────────────────────────────────────────────────────────────────────────
function ProfileScreen({user,balance,activeSession,timeLeft}){
  const [topups,setTopups]=useState([]);

  useEffect(()=>{
    if(!user)return;
    sb.from("topups").select("*").eq("user_id",user.id).order("created_at",{ascending:false}).limit(10)
      .then(({data})=>{if(data)setTopups(data);});
  },[user]);

  const fmtTime=(secs)=>{
    if(secs==null)return"--:--";
    const h=Math.floor(secs/3600);
    const m=Math.floor((secs%3600)/60);
    const s=secs%60;
    if(h>0)return`${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
    return`${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  };

  const sessionProgress=activeSession&&timeLeft!=null
    ? Math.max(0,Math.min(100,100-(timeLeft/(activeSession.duration_hours*3600)*100)))
    : 0;

  const name=(user?.display_name||user?.first_name||"Игрок").toUpperCase();
  const memberId=user?.id?String(user.id).slice(-4).padStart(4,"0"):"????";
  const joinDate=user?.created_at?new Date(user.created_at).toLocaleDateString("ru",{month:"long",year:"numeric"}):"";

  return(
    <div style={{overflowY:"auto",flex:1,padding:"0 18px"}}>
      {/* Profile card */}
      <div style={{marginTop:16,background:C.card,border:`1px solid ${C.neonBorder}`,borderRadius:16,padding:18,position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,${C.neon},transparent)`}}/>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <div style={{width:60,height:60,borderRadius:16,background:"linear-gradient(135deg,#1a4d00,#2d8500)",border:`2px solid ${C.neon}50`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,boxShadow:`0 0 16px ${C.neonGlow}`,flexShrink:0}}>👾</div>
          <div>
            <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:24,color:C.text,lineHeight:1}}>{name}</div>
            {user?.username&&<div style={{fontFamily:"'Oswald',sans-serif",fontSize:10,color:C.muted,marginTop:2}}>@{user.username}</div>}
            <div style={{fontFamily:"'Oswald',sans-serif",fontSize:10,color:C.neon,marginTop:3,letterSpacing:"0.15em"}}>MEMBER #{memberId}</div>
            {joinDate&&<div style={{fontFamily:"'Inter',sans-serif",fontSize:10,color:C.muted,marginTop:2}}>С нами с {joinDate}</div>}
            {user?.admin_note&&<div style={{fontFamily:"'Inter',sans-serif",fontSize:11,color:C.yellow,marginTop:4}}>📝 {user.admin_note}</div>}
          </div>
        </div>
      </div>

      {/* Balance card */}
      <div style={{marginTop:12,background:"rgba(57,255,20,0.06)",border:`1px solid ${C.neonBorder}`,borderRadius:16,padding:18,position:"relative",overflow:"hidden",boxShadow:`0 0 20px ${C.neonGlow}`}}>
        <div style={{position:"absolute",top:0,left:0,right:0,height:2,background:C.neon}}/>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <div style={{fontFamily:"'Oswald',sans-serif",fontSize:10,color:C.muted,letterSpacing:"0.18em"}}>МОЙ БАЛАНС</div>
            <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:46,color:C.neon,lineHeight:1,marginTop:4,textShadow:`0 0 20px ${C.neonGlow}`}}>{balance}<span style={{fontSize:20}}> РУБ</span></div>
          </div>
        </div>
        <div style={{marginTop:12,background:C.card,border:`1px solid ${C.neonBorder}`,borderRadius:12,padding:14}}>
          <div style={{fontFamily:"'Inter',sans-serif",fontSize:12,color:C.muted,lineHeight:1.6}}>
            💳 Для пополнения баланса обратись к администратору или напиши в чат.
          </div>
        </div>
        {topups.length>0&&(
          <div style={{marginTop:14}}>
            <div style={{fontFamily:"'Oswald',sans-serif",fontSize:10,color:C.muted,letterSpacing:"0.15em",marginBottom:8}}>ИСТОРИЯ ПОПОЛНЕНИЙ</div>
            {topups.map((h,i)=>(
              <div key={h.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:i<topups.length-1?"1px solid rgba(57,255,20,0.06)":"none"}}>
                <div>
                  <div style={{fontFamily:"'Oswald',sans-serif",fontSize:12,color:C.text}}>{h.note||"Пополнение"}</div>
                  <div style={{fontFamily:"'Inter',sans-serif",fontSize:10,color:C.muted}}>{new Date(h.created_at).toLocaleDateString("ru")}</div>
                </div>
                <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:16,color:C.neon}}>+{h.amount} Р</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Active session */}
      {activeSession?(
        <div style={{marginTop:12,background:"rgba(57,255,20,0.07)",border:`1px solid ${C.neonBorder}`,borderRadius:14,padding:16,boxShadow:`0 0 20px ${C.neonGlow}`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{display:"flex",alignItems:"center",gap:7}}>
              <div style={{width:7,height:7,borderRadius:"50%",background:C.neon,boxShadow:`0 0 6px ${C.neon}`}} className="blink"/>
              <span style={{fontFamily:"'Oswald',sans-serif",fontSize:11,color:C.neon,letterSpacing:"0.1em",fontWeight:600}}>АКТИВНАЯ СЕССИЯ</span>
            </div>
            <span style={{fontFamily:"'Oswald',sans-serif",fontSize:11,color:C.muted}}>ПК #{activeSession.pc_number}</span>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:10}}>
            <div>
              <div style={{fontFamily:"'Oswald',sans-serif",fontSize:10,color:C.muted,letterSpacing:"0.1em"}}>ОСТАЛОСЬ</div>
              <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:36,color:timeLeft<300?C.red:C.text,lineHeight:1}}>{fmtTime(timeLeft)}</div>
            </div>
            <div style={{fontFamily:"'Oswald',sans-serif",fontSize:11,color:C.muted}}>из {activeSession.duration_hours} ч.</div>
          </div>
          <div style={{height:4,borderRadius:4,background:"rgba(57,255,20,0.12)"}}>
            <div style={{width:`${sessionProgress}%`,height:"100%",borderRadius:4,background:timeLeft<300?C.red:C.neon,boxShadow:`0 0 6px ${timeLeft<300?C.red:C.neon}`,transition:"width 1s linear"}}/>
          </div>
        </div>
      ):(
        <div style={{marginTop:12,background:C.card,border:"1px solid rgba(57,255,20,0.1)",borderRadius:14,padding:16,textAlign:"center"}}>
          <div style={{fontFamily:"'Oswald',sans-serif",fontSize:13,color:C.muted}}>Нет активной сессии</div>
          <div style={{fontFamily:"'Inter',sans-serif",fontSize:11,color:C.muted,marginTop:4}}>Забронируй компьютер во вкладке ⚡</div>
        </div>
      )}
      <div style={{height:90}}/>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN MENU EDITOR — add/edit/delete items & categories with emoji
// ─────────────────────────────────────────────────────────────────────────────
const EMOJI_PICKER=["🍔","🌭","🍕","🍟","🍗","🥤","☕","⚡","🔥","💧","🧃","🍫","🥔","🍬","🧄","🍪","🍩","🌮","🥪","🍜","🍝","🥗","🧀","🍳","🥓","🍺","🥨","🍤","🧁","🍰"];

function AdminMenuEditor({menuCats,onMenuChange}){
  const [editItem,setEditItem]=useState(null); // {ci, ii}
  const [addingTo,setAddingTo]=useState(null);  // category index
  const [showAddCat,setShowAddCat]=useState(false);
  const [draft,setDraft]=useState({name:"",price:"",emoji:"🍔",desc:""});
  const [catDraft,setCatDraft]=useState({label:"",emoji:"🍔"});

  const genId=()=>"i"+Date.now()+Math.floor(Math.random()*1000);

  const updateItem=(ci,ii,patch)=>{
    onMenuChange(menuCats.map((c,i)=>i!==ci?c:{...c,items:c.items.map((it,j)=>j!==ii?it:{...it,...patch})}));
  };
  const deleteItem=(ci,ii)=>{
    onMenuChange(menuCats.map((c,i)=>i!==ci?c:{...c,items:c.items.filter((_,j)=>j!==ii)}));
    setEditItem(null);
  };
  const addItem=(ci)=>{
    if(!draft.name||!draft.price)return;
    const item={id:genId(),name:draft.name,price:parseInt(draft.price),emoji:draft.emoji,desc:draft.desc};
    onMenuChange(menuCats.map((c,i)=>i!==ci?c:{...c,items:[...c.items,item]}));
    setAddingTo(null);setDraft({name:"",price:"",emoji:"🍔",desc:""});
  };
  const addCat=()=>{
    if(!catDraft.label)return;
    onMenuChange([...menuCats,{id:"c"+Date.now(),label:catDraft.emoji+" "+catDraft.label.toUpperCase(),items:[]}]);
    setShowAddCat(false);setCatDraft({label:"",emoji:"🍔"});
  };
  const deleteCat=(ci)=>{
    if(window.confirm("Удалить категорию со всеми позициями?"))onMenuChange(menuCats.filter((_,i)=>i!==ci));
  };

  const inp={width:"100%",background:"rgba(57,255,20,0.05)",border:`1px solid ${C.neonBorder}`,borderRadius:8,padding:"9px 11px",color:C.text,fontSize:13,fontFamily:"'Inter',sans-serif",outline:"none",colorScheme:"dark",marginBottom:8};

  const EmojiGrid=({value,onPick})=>(
    <div style={{display:"flex",gap:5,overflowX:"auto",padding:"6px 0",marginBottom:8}}>
      {EMOJI_PICKER.map(e=>(
        <button key={e} onClick={()=>onPick(e)} style={{flexShrink:0,width:34,height:34,borderRadius:8,border:`1px solid ${value===e?C.neon:C.neonBorder}`,background:value===e?"rgba(57,255,20,0.15)":C.card,fontSize:18,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>{e}</button>
      ))}
    </div>
  );

  return(
    <div style={{overflowY:"auto",flex:1,padding:"0 18px"}}>
      <SectionHead label="РЕДАКТОР МЕНЮ" color={C.cyan}/>
      {menuCats.map((cat,ci)=>(
        <div key={cat.id} style={{marginBottom:18}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <span style={{fontFamily:"'Oswald',sans-serif",fontSize:12,color:C.cyan,letterSpacing:"0.1em"}}>{cat.label}</span>
            <button onClick={()=>deleteCat(ci)} style={{background:"transparent",border:"none",color:C.red,cursor:"pointer",fontSize:14}}>🗑</button>
          </div>
          {cat.items.map((item,ii)=>(
            <div key={item.id} style={{marginBottom:8}}>
              {editItem&&editItem.ci===ci&&editItem.ii===ii?(
                <div style={{background:C.card,border:`1px solid ${C.neon}50`,borderRadius:10,padding:12}}>
                  <EmojiGrid value={item.emoji} onPick={e=>updateItem(ci,ii,{emoji:e})}/>
                  <input value={item.name} onChange={e=>updateItem(ci,ii,{name:e.target.value})} placeholder="Название" style={inp}/>
                  <input value={item.desc||""} onChange={e=>updateItem(ci,ii,{desc:e.target.value})} placeholder="Описание (330мл, с соусом...)" style={inp}/>
                  <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8}}>
                    <input type="number" value={item.price} onChange={e=>updateItem(ci,ii,{price:parseInt(e.target.value)||0})} placeholder="Цена" style={{...inp,marginBottom:0,width:100}}/>
                    <span style={{fontFamily:"'Oswald',sans-serif",fontSize:12,color:C.muted}}>руб</span>
                  </div>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={()=>setEditItem(null)} style={{flex:1,background:"rgba(57,255,20,0.1)",border:`1px solid ${C.neonBorder}`,borderRadius:8,padding:"8px",color:C.neon,cursor:"pointer",fontFamily:"'Oswald',sans-serif",fontSize:12}}>ГОТОВО</button>
                    <button onClick={()=>deleteItem(ci,ii)} style={{background:"rgba(255,45,45,0.1)",border:"1px solid rgba(255,45,45,0.3)",borderRadius:8,padding:"8px 14px",color:C.red,cursor:"pointer",fontFamily:"'Oswald',sans-serif",fontSize:12}}>УДАЛИТЬ</button>
                  </div>
                </div>
              ):(
                <div onClick={()=>setEditItem({ci,ii})} style={{display:"flex",alignItems:"center",gap:10,background:C.card,border:`1px solid ${C.neonBorder}`,borderRadius:10,padding:"10px 12px",cursor:"pointer"}}>
                  <span style={{fontSize:20,flexShrink:0}}>{item.emoji}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontFamily:"'Oswald',sans-serif",fontSize:13,color:C.text,fontWeight:600}}>{item.name}</div>
                    {item.desc&&<div style={{fontFamily:"'Inter',sans-serif",fontSize:10,color:C.muted}}>{item.desc}</div>}
                  </div>
                  <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:18,color:C.neon}}>{item.price} р</span>
                  <span style={{color:C.muted,fontSize:12}}>✎</span>
                </div>
              )}
            </div>
          ))}
          {addingTo===ci?(
            <div style={{background:C.card,border:`1px solid ${C.neon}40`,borderRadius:10,padding:12,marginTop:4}}>
              <EmojiGrid value={draft.emoji} onPick={e=>setDraft(d=>({...d,emoji:e}))}/>
              <input value={draft.name} onChange={e=>setDraft(d=>({...d,name:e.target.value}))} placeholder="Название позиции" style={inp}/>
              <input value={draft.desc} onChange={e=>setDraft(d=>({...d,desc:e.target.value}))} placeholder="Описание (необязательно)" style={inp}/>
              <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8}}>
                <input type="number" value={draft.price} onChange={e=>setDraft(d=>({...d,price:e.target.value}))} placeholder="Цена" style={{...inp,marginBottom:0,width:100}}/>
                <span style={{fontFamily:"'Oswald',sans-serif",fontSize:12,color:C.muted}}>руб</span>
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>addItem(ci)} style={{flex:1,background:`linear-gradient(90deg,#1a4d00,#2d8500)`,border:`1px solid ${C.neon}60`,borderRadius:8,padding:"9px",color:C.neon,cursor:"pointer",fontFamily:"'Oswald',sans-serif",fontSize:12}}>ДОБАВИТЬ</button>
                <button onClick={()=>setAddingTo(null)} style={{background:"transparent",border:`1px solid ${C.neonBorder}`,borderRadius:8,padding:"9px 14px",color:C.muted,cursor:"pointer",fontFamily:"'Oswald',sans-serif",fontSize:12}}>ОТМЕНА</button>
              </div>
            </div>
          ):(
            <button onClick={()=>{setAddingTo(ci);setDraft({name:"",price:"",emoji:"🍔",desc:""});}} style={{width:"100%",background:"rgba(57,255,20,0.04)",border:`1px dashed ${C.neonBorder}`,borderRadius:8,padding:"8px",color:C.neon,cursor:"pointer",fontFamily:"'Oswald',sans-serif",fontSize:11,marginTop:4}}>+ ПОЗИЦИЯ В «{cat.label}»</button>
          )}
        </div>
      ))}

      {/* Add category */}
      {showAddCat?(
        <div style={{background:C.card,border:`1px solid ${C.neon}40`,borderRadius:10,padding:12,marginBottom:8}}>
          <EmojiGrid value={catDraft.emoji} onPick={e=>setCatDraft(d=>({...d,emoji:e}))}/>
          <input value={catDraft.label} onChange={e=>setCatDraft(d=>({...d,label:e.target.value}))} placeholder="Название категории (НАПИТКИ...)" style={inp}/>
          <div style={{display:"flex",gap:8}}>
            <button onClick={addCat} style={{flex:1,background:`linear-gradient(90deg,#1a4d00,#2d8500)`,border:`1px solid ${C.neon}60`,borderRadius:8,padding:"9px",color:C.neon,cursor:"pointer",fontFamily:"'Oswald',sans-serif",fontSize:12}}>СОЗДАТЬ КАТЕГОРИЮ</button>
            <button onClick={()=>setShowAddCat(false)} style={{background:"transparent",border:`1px solid ${C.neonBorder}`,borderRadius:8,padding:"9px 14px",color:C.muted,cursor:"pointer",fontFamily:"'Oswald',sans-serif",fontSize:12}}>ОТМЕНА</button>
          </div>
        </div>
      ):(
        <button onClick={()=>setShowAddCat(true)} style={{width:"100%",background:"rgba(0,229,255,0.06)",border:`1px dashed rgba(0,229,255,0.3)`,borderRadius:10,padding:"11px",color:C.cyan,cursor:"pointer",fontFamily:"'Oswald',sans-serif",fontSize:12,marginBottom:8}}>+ НОВАЯ КАТЕГОРИЯ</button>
      )}
      <div style={{fontFamily:"'Inter',sans-serif",fontSize:10,color:C.muted,textAlign:"center",marginTop:8,lineHeight:1.5}}>
        ⚠️ Изменения меню сохраняются на время сессии.<br/>Для постоянного сохранения нужна доработка БД.
      </div>
      <div style={{height:30}}/>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN CHAT — pick a player, see their conversation
// ─────────────────────────────────────────────────────────────────────────────
function AdminChat({allUsers,onAdminSend,onRead}){
  const [selectedUserId,setSelectedUserId]=useState(null);
  const [msgs,setMsgs]=useState([]);
  const [unreadByUser,setUnreadByUser]=useState({});
  const pollRef=useRef(null);

  const selectedUser=allUsers.find(u=>u.id===selectedUserId);

  const loadMsgs=useCallback(async()=>{
    if(!selectedUserId)return;
    const {data}=await sb.from("messages").select("*").eq("user_id",selectedUserId).order("created_at",{ascending:true}).limit(100);
    if(data){
      setMsgs(data.map(m=>({id:m.id,from:m.from_admin?"admin":"user",text:m.text,time:new Date(m.created_at).toLocaleTimeString("ru",{hour:"2-digit",minute:"2-digit"})})));
    }
  },[selectedUserId]);

  // Load last message preview + unread for each user
  const loadPreviews=useCallback(async()=>{
    const counts={};
    for(const u of allUsers){
      const {data}=await sb.from("messages").select("*").eq("user_id",u.id).order("created_at",{ascending:false}).limit(1);
      if(data&&data[0]&&!data[0].from_admin){
        counts[u.id]=data[0].text;
      }
    }
    setUnreadByUser(counts);
  },[allUsers]);

  useEffect(()=>{loadPreviews();},[allUsers,loadPreviews]);

  useEffect(()=>{
    if(!selectedUserId)return;
    loadMsgs();
    onRead&&onRead();
    pollRef.current=setInterval(loadMsgs,3000);
    return()=>clearInterval(pollRef.current);
  },[selectedUserId,loadMsgs,onRead]);

  const handleSend=async(text)=>{
    await onAdminSend(text,selectedUserId);
    setMsgs(m=>[...m,{id:Date.now(),from:"admin",text,time:new Date().toLocaleTimeString("ru",{hour:"2-digit",minute:"2-digit"})}]);
  };

  // User list view
  if(!selectedUserId){
    return(
      <div style={{flex:1,overflowY:"auto",padding:"0 18px"}}>
        <SectionHead label="ДИАЛОГИ С ИГРОКАМИ" color={C.neon}/>
        {allUsers.length===0&&<div style={{textAlign:"center",padding:"30px 0",fontFamily:"'Oswald',sans-serif",fontSize:13,color:C.muted}}>Нет игроков</div>}
        {allUsers.map(u=>(
          <button key={u.id} onClick={()=>setSelectedUserId(u.id)} style={{width:"100%",textAlign:"left",display:"flex",alignItems:"center",gap:12,marginBottom:8,background:C.card,border:`1px solid ${unreadByUser[u.id]?C.neonBorder:"rgba(57,255,20,0.1)"}`,borderRadius:12,padding:"12px 14px",cursor:"pointer"}}>
            <div style={{width:40,height:40,borderRadius:12,background:"linear-gradient(135deg,#1a4d00,#2d8500)",border:`1px solid ${C.neon}40`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>👾</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontFamily:"'Oswald',sans-serif",fontSize:14,color:C.text,fontWeight:600}}>{u.display_name||u.first_name}{u.username?" · @"+u.username:""}</div>
              <div style={{fontFamily:"'Inter',sans-serif",fontSize:11,color:unreadByUser[u.id]?C.neon:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{unreadByUser[u.id]||"Нажми чтобы открыть диалог"}</div>
            </div>
            {unreadByUser[u.id]&&<div style={{width:9,height:9,borderRadius:"50%",background:C.neon,boxShadow:`0 0 6px ${C.neon}`,flexShrink:0}}/>}
          </button>
        ))}
      </div>
    );
  }

  // Conversation view
  return(
    <div style={{display:"flex",flexDirection:"column",flex:1,minHeight:0}}>
      <div style={{padding:"10px 18px",borderBottom:`1px solid ${C.neonBorder}`,display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
        <button onClick={()=>setSelectedUserId(null)} style={{background:"transparent",border:`1px solid ${C.neonBorder}`,borderRadius:8,padding:"6px 12px",color:C.neon,cursor:"pointer",fontFamily:"'Oswald',sans-serif",fontSize:12}}>←</button>
        <div style={{width:34,height:34,borderRadius:10,background:"linear-gradient(135deg,#1a4d00,#2d8500)",border:`1px solid ${C.neon}40`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>👾</div>
        <div>
          <div style={{fontFamily:"'Oswald',sans-serif",fontSize:14,color:C.text,fontWeight:700}}>{selectedUser?.display_name||selectedUser?.first_name}</div>
          <div style={{fontFamily:"'Inter',sans-serif",fontSize:10,color:C.muted}}>{selectedUser?.username?"@"+selectedUser.username:"ID "+selectedUser?.id}</div>
        </div>
      </div>
      <ChatUIBody msgs={msgs} onSend={handleSend} isAdmin={true} quickReplies={["Уже несу! 🛵","Окей, минуту 👍","Уточни ПК?","Готово ✅"]}/>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN COMPUTER EDITOR
// ─────────────────────────────────────────────────────────────────────────────
function AdminComputerEditor({computers,zones,bookings,onRefresh}){
  const [editPc,setEditPc]=useState(null);
  const [editZone,setEditZone]=useState(null);
  const [showAddPc,setShowAddPc]=useState(false);
  const [showAddZone,setShowAddZone]=useState(false);
  const [newPcNum,setNewPcNum]=useState("");
  const [newPcZone,setNewPcZone]=useState("");
  const [newPcSpec,setNewPcSpec]=useState("");
  const [newZoneName,setNewZoneName]=useState("");
  const [newZoneColor,setNewZoneColor]=useState("#39FF14");
  const [saving,setSaving]=useState(false);

  const now=new Date();
  const getStatus=(pc)=>{
    const active=(bookings||[]).find(b=>b.computer_id===pc.id&&new Date(b.starts_at)<=now&&new Date(b.ends_at)>now&&b.status!=="cancelled");
    const upcoming=(bookings||[]).find(b=>b.computer_id===pc.id&&new Date(b.starts_at)>now&&b.status!=="cancelled");
    return pc.status==="off"?"off":active?"busy":upcoming?"reserved":"available";
  };

  const save=async(table,id,data)=>{
    setSaving(true);
    await sb.from(table).update(data).eq("id",id);
    await onRefresh();
    setSaving(false);
  };
  const del=async(table,id)=>{
    setSaving(true);
    await sb.from(table).delete().eq("id",id);
    await onRefresh();
    setSaving(false);
  };
  const addPc=async()=>{
    if(!newPcNum||!newPcZone)return;
    setSaving(true);
    await sb.from("computers").insert({number:parseInt(newPcNum),zone_id:newPcZone,spec:newPcSpec,status:"available",sort_order:parseInt(newPcNum)});
    setShowAddPc(false);setNewPcNum("");setNewPcSpec("");
    await onRefresh();setSaving(false);
  };
  const addZone=async()=>{
    if(!newZoneName)return;
    setSaving(true);
    await sb.from("zones").insert({name:newZoneName,color:newZoneColor,sort_order:99});
    setShowAddZone(false);setNewZoneName("");
    await onRefresh();setSaving(false);
  };

  const inp={width:"100%",background:"rgba(57,255,20,0.05)",border:`1px solid ${C.neonBorder}`,borderRadius:8,padding:"8px 10px",color:C.text,fontSize:13,fontFamily:"'Inter',sans-serif",outline:"none",colorScheme:"dark",marginBottom:8};

  return(
    <div style={{overflowY:"auto",flex:1,padding:"0 18px"}}>
      {/* ZONES */}
      <SectionHead label="ЗОНЫ" color={C.cyan}/>
      {(zones||[]).map(z=>(
        <div key={z.id} style={{background:C.card,border:`1px solid ${z.color}30`,borderRadius:12,padding:"12px 14px",marginBottom:8}}>
          {editZone===z.id?(
            <div>
              <input value={z.name} onChange={async e=>await save("zones",z.id,{name:e.target.value})} style={inp} placeholder="Название зоны"/>
              <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8}}>
                <span style={{fontFamily:"'Inter',sans-serif",fontSize:11,color:C.muted}}>Цвет:</span>
                {["#39FF14","#FFD600","#B026FF","#00E5FF","#FF2D2D","#94a3b8"].map(col=>(
                  <div key={col} onClick={async()=>await save("zones",z.id,{color:col})} style={{width:22,height:22,borderRadius:"50%",background:col,cursor:"pointer",border:z.color===col?"2px solid #fff":"2px solid transparent"}}/>
                ))}
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>setEditZone(null)} style={{flex:1,background:"rgba(57,255,20,0.1)",border:`1px solid ${C.neonBorder}`,borderRadius:8,padding:"8px",color:C.neon,cursor:"pointer",fontFamily:"'Oswald',sans-serif",fontSize:12}}>ГОТОВО</button>
                <button onClick={async()=>{if(window.confirm("Удалить зону?"))await del("zones",z.id);setEditZone(null);}} style={{background:"rgba(255,45,45,0.1)",border:"1px solid rgba(255,45,45,0.3)",borderRadius:8,padding:"8px 14px",color:C.red,cursor:"pointer",fontFamily:"'Oswald',sans-serif",fontSize:12}}>✕</button>
              </div>
            </div>
          ):(
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}} onClick={()=>setEditZone(z.id)}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{width:10,height:10,borderRadius:"50%",background:z.color}}/>
                <span style={{fontFamily:"'Oswald',sans-serif",fontSize:14,color:C.text}}>{z.name}</span>
                <span style={{fontFamily:"'Inter',sans-serif",fontSize:10,color:C.muted}}>{(computers||[]).filter(c=>c.zone_id===z.id).length} ПК</span>
              </div>
              <span style={{color:C.muted,fontSize:14}}>✎</span>
            </div>
          )}
        </div>
      ))}
      {showAddZone?(
        <div style={{background:C.card,border:`1px solid ${C.neonBorder}`,borderRadius:12,padding:14,marginBottom:8}}>
          <input value={newZoneName} onChange={e=>setNewZoneName(e.target.value)} placeholder="Название (напр. PLAYSTATION)" style={inp}/>
          <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8}}>
            {["#39FF14","#FFD600","#B026FF","#00E5FF","#FF2D2D","#94a3b8"].map(col=>(
              <div key={col} onClick={()=>setNewZoneColor(col)} style={{width:22,height:22,borderRadius:"50%",background:col,cursor:"pointer",border:newZoneColor===col?"2px solid #fff":"2px solid transparent"}}/>
            ))}
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={addZone} disabled={saving} style={{flex:1,background:`linear-gradient(90deg,#1a4d00,#2d8500)`,border:`1px solid ${C.neon}60`,borderRadius:8,padding:"9px",color:C.neon,cursor:"pointer",fontFamily:"'Oswald',sans-serif",fontSize:13}}>ДОБАВИТЬ</button>
            <button onClick={()=>setShowAddZone(false)} style={{background:"transparent",border:`1px solid ${C.neonBorder}`,borderRadius:8,padding:"9px 14px",color:C.muted,cursor:"pointer",fontFamily:"'Oswald',sans-serif",fontSize:13}}>ОТМЕНА</button>
          </div>
        </div>
      ):(
        <button onClick={()=>setShowAddZone(true)} style={{width:"100%",background:"rgba(57,255,20,0.05)",border:`1px dashed ${C.neonBorder}`,borderRadius:10,padding:"10px",color:C.neon,cursor:"pointer",fontFamily:"'Oswald',sans-serif",fontSize:12,marginBottom:8}}>+ ДОБАВИТЬ ЗОНУ</button>
      )}

      {/* COMPUTERS */}
      <SectionHead label="КОМПЬЮТЕРЫ" color={C.neon}/>
      {(zones||[]).map(z=>{
        const pcs=(computers||[]).filter(c=>c.zone_id===z.id).sort((a,b)=>a.number-b.number);
        if(!pcs.length)return null;
        return(
          <div key={z.id} style={{marginBottom:16}}>
            <div style={{fontFamily:"'Oswald',sans-serif",fontSize:10,color:z.color,letterSpacing:"0.15em",marginBottom:8}}>● {z.name}</div>
            {pcs.map(pc=>{
              const liveStatus=getStatus(pc);
              const s=ST[liveStatus]||ST.available;
              return(
                <div key={pc.id} style={{background:C.card,border:`1px solid ${s.color}25`,borderRadius:10,padding:"10px 12px",marginBottom:6}}>
                  {editPc===pc.id?(
                    <div>
                      <div style={{display:"flex",gap:8,marginBottom:8,alignItems:"center"}}>
                        <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:18,color:C.neon,minWidth:40}}>#{pc.number}</span>
                        <select value={pc.status} onChange={async e=>await save("computers",pc.id,{status:e.target.value})} style={{flex:1,...inp,marginBottom:0}}>
                          <option value="available">Свободно</option>
                          <option value="off">Выключен</option>
                        </select>
                      </div>
                      <input defaultValue={pc.spec||""} onBlur={async e=>await save("computers",pc.id,{spec:e.target.value})} placeholder="Начинка: RTX 4090..." style={inp}/>
                      <div style={{display:"flex",gap:8}}>
                        <button onClick={()=>setEditPc(null)} style={{flex:1,background:"rgba(57,255,20,0.1)",border:`1px solid ${C.neonBorder}`,borderRadius:8,padding:"7px",color:C.neon,cursor:"pointer",fontFamily:"'Oswald',sans-serif",fontSize:12}}>ГОТОВО</button>
                        <button onClick={async()=>{if(window.confirm(`Удалить ПК #${pc.number}?`))await del("computers",pc.id);setEditPc(null);}} style={{background:"rgba(255,45,45,0.1)",border:"1px solid rgba(255,45,45,0.3)",borderRadius:8,padding:"7px 12px",color:C.red,cursor:"pointer",fontFamily:"'Oswald',sans-serif",fontSize:12}}>✕</button>
                      </div>
                    </div>
                  ):(
                    <div style={{display:"flex",alignItems:"center",gap:10}} onClick={()=>setEditPc(pc.id)}>
                      <div style={{width:8,height:8,borderRadius:"50%",background:s.color,flexShrink:0}}/>
                      <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:16,color:C.text,minWidth:36}}>#{pc.number}</span>
                      <span style={{fontFamily:"'Inter',sans-serif",fontSize:10,color:C.muted,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{pc.spec||"—"}</span>
                      <span style={{fontFamily:"'Oswald',sans-serif",fontSize:9,color:s.color}}>{s.label}</span>
                      <span style={{color:C.muted,fontSize:12,flexShrink:0}}>✎</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
      {showAddPc?(
        <div style={{background:C.card,border:`1px solid ${C.neonBorder}`,borderRadius:12,padding:14,marginBottom:8}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
            <input type="number" value={newPcNum} onChange={e=>setNewPcNum(e.target.value)} placeholder="Номер ПК" style={{...inp,marginBottom:0}}/>
            <select value={newPcZone} onChange={e=>setNewPcZone(e.target.value)} style={{...inp,marginBottom:0,appearance:"none"}}>
              <option value="">Зона...</option>
              {(zones||[]).map(z=><option key={z.id} value={z.id}>{z.name}</option>)}
            </select>
          </div>
          <input value={newPcSpec} onChange={e=>setNewPcSpec(e.target.value)} placeholder="Начинка (необязательно)" style={inp}/>
          <div style={{display:"flex",gap:8}}>
            <button onClick={addPc} disabled={saving} style={{flex:1,background:`linear-gradient(90deg,#1a4d00,#2d8500)`,border:`1px solid ${C.neon}60`,borderRadius:8,padding:"9px",color:C.neon,cursor:"pointer",fontFamily:"'Oswald',sans-serif",fontSize:13}}>ДОБАВИТЬ ПК</button>
            <button onClick={()=>setShowAddPc(false)} style={{background:"transparent",border:`1px solid ${C.neonBorder}`,borderRadius:8,padding:"9px 14px",color:C.muted,cursor:"pointer",fontFamily:"'Oswald',sans-serif",fontSize:13}}>ОТМЕНА</button>
          </div>
        </div>
      ):(
        <button onClick={()=>setShowAddPc(true)} style={{width:"100%",background:"rgba(57,255,20,0.05)",border:`1px dashed ${C.neonBorder}`,borderRadius:10,padding:"10px",color:C.neon,cursor:"pointer",fontFamily:"'Oswald',sans-serif",fontSize:12,marginBottom:8}}>+ ДОБАВИТЬ КОМПЬЮТЕР</button>
      )}
      <div style={{height:30}}/>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN PIN GATE
// ─────────────────────────────────────────────────────────────────────────────
function AdminPinGate({onSuccess,onCancel}){
  const [digits,setDigits]=useState([]);
  const [shake,setShake]=useState(false);
  const [wrongCount,setWrongCount]=useState(0);
  const [checking,setChecking]=useState(false);

  const press=async(d)=>{
    if(digits.length>=4||checking)return;
    const next=[...digits,d];
    setDigits(next);
    if(next.length===4){
      setChecking(true);
      const ok=await checkAdminPin(next.join(""));
      setChecking(false);
      if(ok){
        setTimeout(()=>onSuccess(),200);
      } else {
        setShake(true);
        setWrongCount(w=>w+1);
        setTimeout(()=>{setDigits([]);setShake(false);},600);
      }
    }
  };
  const del=()=>setDigits(d=>d.slice(0,-1));
  const keys=["1","2","3","4","5","6","7","8","9","","0","⌫"];

  return(
    <div style={{position:"absolute",inset:0,zIndex:600,background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:32}}>
      <div style={{position:"absolute",inset:0,background:"repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(57,255,20,0.011) 2px,rgba(57,255,20,0.011) 4px)",pointerEvents:"none"}}/>
      <style>{`@keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-6px)}80%{transform:translateX(6px)}}`}</style>
      <div style={{position:"relative",zIndex:1,width:"100%",maxWidth:300,display:"flex",flexDirection:"column",alignItems:"center"}}>
        <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:13,color:C.red,letterSpacing:"0.25em",marginBottom:8}}>🔐 ADMIN ACCESS</div>
        <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:32,color:C.text,letterSpacing:"0.04em",marginBottom:4}}>КОД ДОСТУПА</div>
        <div style={{fontFamily:"'Inter',sans-serif",fontSize:12,color:C.muted,marginBottom:32,textAlign:"center",minHeight:18}}>
          {checking?<span style={{color:C.neon}}>Проверка...</span>:wrongCount>0?<span style={{color:C.red}}>Неверный код · Попытка {wrongCount}</span>:"Введи 4-значный пин-код"}
        </div>
        {/* dots */}
        <div style={{display:"flex",gap:18,marginBottom:36,animation:shake?"shake 0.5s ease":"none"}}>
          {[0,1,2,3].map(i=>(
            <div key={i} style={{width:18,height:18,borderRadius:"50%",background:i<digits.length?(shake?C.red:C.neon):"transparent",border:`2px solid ${i<digits.length?(shake?C.red:C.neon):C.neonBorder}`,boxShadow:i<digits.length?`0 0 10px ${shake?C.red:C.neon}`:"none",transition:"all 0.15s"}}/>
          ))}
        </div>
        {/* keypad */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,width:"100%"}}>
          {keys.map((k,i)=>(
            k===""?<div key={i}/>:
            <button key={i} onClick={()=>k==="⌫"?del():press(k)} style={{padding:"18px 0",borderRadius:14,background:k==="⌫"?"rgba(255,45,45,0.08)":"rgba(57,255,20,0.06)",border:`1px solid ${k==="⌫"?"rgba(255,45,45,0.25)":C.neonBorder}`,color:k==="⌫"?C.red:C.text,fontFamily:"'Bebas Neue',sans-serif",fontSize:k==="⌫"?22:26,cursor:"pointer",letterSpacing:"0.04em",transition:"background 0.1s"}}>{k}</button>
          ))}
        </div>
        <button onClick={onCancel} style={{marginTop:28,background:"transparent",border:"none",fontFamily:"'Oswald',sans-serif",fontSize:13,color:C.muted,cursor:"pointer",letterSpacing:"0.1em"}}>ОТМЕНА</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN PANEL
// ─────────────────────────────────────────────────────────────────────────────
function AdminPanel({orders,onClose,onDeliverOrder,onTopupUser,chatMsgs,onAdminSend,allUsers=[],adminUnread,onAdminChatOpen,menuCats,onMenuChange,balance,adminComputers,adminZones,adminBookings,onRefreshComputers}){
  const [tab,setTab]=useState("orders");
  const [topupAmt,setTopupAmt]=useState("200");

  const [selectedUserId,setSelectedUserId]=useState(null);
  const selectedUser=allUsers.find(u=>u.id===selectedUserId)||allUsers[0];

  return(
    <div style={{
      position:"absolute",inset:0,zIndex:500,
      background:C.bg,display:"flex",flexDirection:"column",
    }}>
      {/* Admin header */}
      <div style={{padding:"14px 18px",borderBottom:`1px solid ${C.neonBorder}`,display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0,background:"rgba(255,45,45,0.04)"}}>
        <div>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:24,color:C.red,letterSpacing:"0.04em"}}>🔐 ADMIN PANEL</div>
          <div style={{fontFamily:"'Oswald',sans-serif",fontSize:9,color:C.muted,letterSpacing:"0.2em"}}>LEVEL UP ОРША</div>
        </div>
        <button onClick={onClose} style={{background:"rgba(255,45,45,0.1)",border:"1px solid rgba(255,45,45,0.3)",borderRadius:10,padding:"8px 14px",color:C.red,cursor:"pointer",fontFamily:"'Oswald',sans-serif",fontSize:12,letterSpacing:"0.1em"}}>ВЫЙТИ</button>
      </div>

      {/* Admin tabs */}
      <div style={{display:"flex",borderBottom:`1px solid ${C.neonBorder}`,flexShrink:0}}>
        {[{id:"orders",label:"ЗАКАЗЫ"},{id:"chat",label:"ЧАТ"},{id:"topup",label:"БАЛАНС"},{id:"menu",label:"МЕНЮ"},{id:"pcs",label:"КОМПЫ"}].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{
            flex:1,padding:"11px 0",border:"none",background:"none",cursor:"pointer",
            fontFamily:"'Oswald',sans-serif",fontSize:11,letterSpacing:"0.12em",
            color:tab===t.id?C.neon:C.muted,
            borderBottom:`2px solid ${tab===t.id?C.neon:"transparent"}`,
            transition:"all 0.15s",position:"relative",
          }}>
            {t.id==="chat"&&adminUnread>0&&<div style={{position:"absolute",top:6,right:"20%",width:16,height:16,borderRadius:"50%",background:C.red,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:"#fff",fontWeight:700}}>{adminUnread}</div>}
            {t.label}
          </button>
        ))}
      </div>

      <div style={{flex:1,display:"flex",flexDirection:"column",minHeight:0,overflow:"hidden"}}>
        {tab==="chat"&&(
          <AdminChat allUsers={allUsers} onAdminSend={onAdminSend} onRead={onAdminChatOpen}/>
        )}
        <div style={{display:tab==="chat"?"none":"flex",flexDirection:"column",flex:1,overflowY:"auto",padding:"0 18px"}}>
        {/* ORDERS TAB */}
        {tab==="orders"&&(
          <>
            <SectionHead label={`АКТИВНЫЕ ЗАКАЗЫ ${orders.length>0?`(${orders.length})`:""}`} color={C.red}/>
            {orders.length===0&&(
              <div style={{textAlign:"center",padding:"40px 0",fontFamily:"'Oswald',sans-serif",fontSize:14,color:C.muted}}>
                🎮 Заказов пока нет
              </div>
            )}
            {orders.map(o=>(
              <div key={o.id} className="slide-up" style={{marginBottom:12,background:C.card,border:`1px solid ${C.red}30`,borderRadius:14,padding:16,position:"relative",overflow:"hidden"}}>
                <div style={{position:"absolute",top:0,left:0,right:0,height:2,background:C.red}}/>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                  <div>
                    <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,color:C.text}}>ПК <span style={{color:C.neon}}>#{o.pc}</span></div>
                    <div style={{fontFamily:"'Oswald',sans-serif",fontSize:10,color:C.muted,marginTop:2}}>
                      {o.time} · {o.payMethod==="balance"?"💳 Баланс":"💵 Наличные"}
                    </div>
                  </div>
                  <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:22,color:C.yellow}}>{o.total} РУБ</div>
                </div>
                <div style={{marginBottom:12}}>
                  {o.items.map((item,i)=>(
                    <div key={i} style={{fontFamily:"'Inter',sans-serif",fontSize:12,color:C.muted,lineHeight:1.8}}>
                      {item.emoji} {item.name} × {item.qty} — {item.price*item.qty} руб
                    </div>
                  ))}
                </div>
                <button onClick={()=>onDeliverOrder(o.id)} style={{
                  width:"100%",background:"rgba(57,255,20,0.08)",border:`1px solid ${C.neonBorder}`,
                  borderRadius:10,padding:"11px",
                  fontFamily:"'Oswald',sans-serif",fontSize:13,letterSpacing:"0.1em",
                  color:C.neon,cursor:"pointer",
                }}>✅ ДОСТАВЛЕНО</button>
              </div>
            ))}
          </>
        )}

        {/* TOPUP TAB */}
        {tab==="topup"&&(
          <>
            <SectionHead label="ПОПОЛНЕНИЕ БАЛАНСА" color={C.neon}/>
            <div style={{background:C.card,border:`1px solid ${C.neonBorder}`,borderRadius:14,padding:18}}>
              <div style={{marginBottom:14}}>
                <label style={{fontFamily:"'Oswald',sans-serif",fontSize:10,letterSpacing:"0.18em",color:C.muted,display:"block",marginBottom:7}}>ИГРОК</label>
                <select value={selectedUserId||""} onChange={e=>setSelectedUserId(parseInt(e.target.value))} style={{width:"100%",background:C.card,border:`1px solid ${C.neonBorder}`,borderRadius:10,padding:"12px 14px",color:C.text,fontSize:14,fontFamily:"'Inter',sans-serif",outline:"none",appearance:"none",colorScheme:"dark"}}>
                  <option value="">Выбери игрока...</option>
                  {allUsers.map(u=><option key={u.id} value={u.id}>{u.display_name||u.first_name}{u.username?" (@"+u.username+")":""}</option>)}
                </select>
              </div>
              <div style={{marginBottom:14}}>
                <label style={{fontFamily:"'Oswald',sans-serif",fontSize:10,letterSpacing:"0.18em",color:C.muted,display:"block",marginBottom:7}}>СУММА (РУБ)</label>
                <input type="number" value={topupAmt} onChange={e=>setTopupAmt(e.target.value)}
                  style={{width:"100%",background:C.card,border:`1px solid ${C.neonBorder}`,borderRadius:10,padding:"12px 14px",color:C.text,fontSize:22,fontFamily:"'Bebas Neue',sans-serif",outline:"none",colorScheme:"dark"}}/>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:14}}>
                {[50,100,200,500].map(a=>(
                  <button key={a} onClick={()=>setTopupAmt(String(a))} style={{background:"rgba(57,255,20,0.07)",border:`1px solid ${C.neonBorder}`,borderRadius:8,padding:"9px 0",color:C.neon,cursor:"pointer",fontFamily:"'Bebas Neue',sans-serif",fontSize:16}}>{a}</button>
                ))}
              </div>
              <button onClick={()=>{if(topupAmt>0&&selectedUserId){onTopupUser(selectedUserId,parseInt(topupAmt));setTopupAmt("200");}}} style={{
                width:"100%",background:`linear-gradient(90deg,#1a4d00,#2d8500)`,border:`1px solid ${C.neon}60`,
                borderRadius:12,padding:"14px",fontFamily:"'Bebas Neue',sans-serif",fontSize:20,letterSpacing:"0.08em",
                color:C.neon,cursor:"pointer",boxShadow:`0 0 18px rgba(57,255,20,0.2)`,textShadow:`0 0 8px ${C.neon}`,
              }}>+ ЗАЧИСЛИТЬ {topupAmt||0} РУБ</button>
            </div>

            <SectionHead label="БАЛАНСЫ ИГРОКОВ" color={C.muted}/>
            {allUsers.length===0&&<div style={{textAlign:"center",padding:"20px 0",fontFamily:"'Oswald',sans-serif",fontSize:13,color:C.muted}}>Нет зарегистрированных игроков</div>}
            {allUsers.map(u=>(
              <div key={u.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",marginBottom:8,background:selectedUserId===u.id?"rgba(57,255,20,0.09)":C.card,border:`1px solid ${selectedUserId===u.id?C.neonBorder:"rgba(57,255,20,0.1)"}`,borderRadius:12,cursor:"pointer"}} onClick={()=>setSelectedUserId(u.id)}>
                <div>
                  <div style={{fontFamily:"'Oswald',sans-serif",fontSize:14,color:selectedUserId===u.id?C.neon:C.text,fontWeight:600}}>{u.display_name||u.first_name}</div>
                  <div style={{fontFamily:"'Inter',sans-serif",fontSize:10,color:C.muted}}>{u.username?"@"+u.username:""} · ID {u.id}</div>
                  {u.admin_note?<div style={{fontFamily:"'Inter',sans-serif",fontSize:10,color:C.yellow,marginTop:2}}>📝 {u.admin_note}</div>:null}
                </div>
                <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,color:(u.balance||0)<100?C.red:C.neon}}>{u.balance||0} РУБ</div>
              </div>
            ))}
          </>
        )}

        {/* MENU EDITOR TAB */}
        {tab==="menu"&&(
          <AdminMenuEditor menuCats={menuCats} onMenuChange={onMenuChange}/>
        )}

        {/* PCS TAB — full editor */}
        {tab==="pcs"&&(
          <AdminComputerEditor computers={adminComputers} zones={adminZones} bookings={adminBookings} onRefresh={onRefreshComputers}/>
        )}
        <div style={{height:30}}/>
        </div>{/* end scrollable tab content */}
      </div>{/* end flex wrapper */}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TARIFFS SCREEN
// ─────────────────────────────────────────────────────────────────────────────
function TariffsScreen(){
  return(
    <div style={{padding:"0 18px",overflowY:"auto",flex:1}}>
      <div style={{marginTop:16,background:"rgba(255,214,0,0.07)",border:"1px solid rgba(255,214,0,0.22)",borderRadius:14,padding:"16px 18px",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:0,left:0,right:0,height:2,background:C.yellow}}/>
        <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:11,color:C.yellow,letterSpacing:"0.2em"}}>ВСЮ СУББОТУ</div>
        <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:42,color:C.text,lineHeight:1,margin:"2px 0"}}>СКИДКА <span style={{color:C.yellow}}>50%</span></div>
        <div style={{fontFamily:"'Oswald',sans-serif",fontSize:11,color:C.muted}}>Играй больше · Плати меньше</div>
      </div>

      <SectionHead label="ТАРИФЫ"/>
      <div style={{background:C.card,border:`1px solid ${C.neonBorder}`,borderRadius:14,overflow:"hidden",marginBottom:14}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 72px 72px",background:"rgba(57,255,20,0.07)",borderBottom:`1px solid ${C.neonBorder}`,padding:"9px 16px"}}>
          <div style={{fontFamily:"'Oswald',sans-serif",fontSize:10,color:C.neon,letterSpacing:"0.15em"}}>ТАРИФ</div>
          <div style={{fontFamily:"'Oswald',sans-serif",fontSize:10,color:C.neon,letterSpacing:"0.1em",textAlign:"center"}}>STD</div>
          <div style={{fontFamily:"'Oswald',sans-serif",fontSize:10,color:C.yellow,letterSpacing:"0.1em",textAlign:"center"}}>VIP</div>
        </div>
        {TARIFFS.map((t,i)=>(
          <div key={t.name} style={{display:"grid",gridTemplateColumns:"1fr 72px 72px",padding:"13px 16px",borderBottom:i<TARIFFS.length-1?`1px solid rgba(57,255,20,0.07)`:"none",alignItems:"center"}}>
            <div>
              <div style={{display:"flex",alignItems:"center",gap:7}}>
                <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:17,color:C.text,letterSpacing:"0.04em"}}>{t.name}</span>
                {t.tag&&<span style={{fontFamily:"'Oswald',sans-serif",fontSize:9,color:C.neon,background:"rgba(57,255,20,0.1)",border:`1px solid ${C.neonBorder}`,borderRadius:10,padding:"1px 7px"}}>{t.tag}</span>}
              </div>
              <div style={{fontFamily:"'Inter',sans-serif",fontSize:10,color:C.muted}}>{t.hours}</div>
            </div>
            <div style={{textAlign:"center",fontFamily:"'Bebas Neue',sans-serif",fontSize:18,color:C.neon}}>{t.std}<span style={{fontSize:11,color:C.muted}}> р</span></div>
            <div style={{textAlign:"center",fontFamily:"'Bebas Neue',sans-serif",fontSize:18,color:C.yellow}}>{t.vip}<span style={{fontSize:11,color:C.muted}}> р</span></div>
          </div>
        ))}
      </div>

      <div style={{background:"rgba(176,38,255,0.07)",border:"1px solid rgba(176,38,255,0.2)",borderRadius:14,padding:16,marginBottom:12,position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:0,left:0,right:0,height:2,background:C.purple}}/>
        <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:16,color:C.purple,letterSpacing:"0.1em",marginBottom:6}}>CASHBACK 5%</div>
        <div style={{fontFamily:"'Inter',sans-serif",fontSize:12,color:C.muted,lineHeight:1.7}}>С каждой сессии 5% возвращается на баланс. Накопил 500 руб — час в подарок.</div>
      </div>
      <div style={{height:90}}/>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EVENTS SCREEN
// ─────────────────────────────────────────────────────────────────────────────
function EventsScreen(){
  return(
    <div style={{padding:"0 18px",overflowY:"auto",flex:1}}>
      <SectionHead label="БЛИЖАЙШИЕ СОБЫТИЯ"/>
      {EVENTS.map(ev=>(
        <div key={ev.title} style={{marginBottom:12,background:C.card,border:`1px solid ${ev.color}25`,borderRadius:14,padding:"16px",position:"relative",overflow:"hidden"}}>
          <div style={{position:"absolute",top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,${ev.color},transparent)`}}/>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:22,color:C.text,letterSpacing:"0.04em",lineHeight:1}}>{ev.emoji} {ev.title}</div>
          <div style={{fontFamily:"'Oswald',sans-serif",fontSize:11,color:C.muted,marginTop:4}}>📅 {ev.date} · {ev.sub}</div>
          <div style={{fontFamily:"'Oswald',sans-serif",fontSize:12,color:ev.color,marginTop:5,fontWeight:600}}>🏆 ПРИЗ: {ev.prize}</div>
          <button style={{marginTop:12,width:"100%",background:`${ev.color}10`,border:`1px solid ${ev.color}35`,borderRadius:8,padding:"9px",fontFamily:"'Oswald',sans-serif",fontSize:12,letterSpacing:"0.1em",color:ev.color,cursor:"pointer",fontWeight:600}}>ЗАРЕГИСТРИРОВАТЬСЯ</button>
        </div>
      ))}
      <SectionHead label="ТОП МЕСЯЦА"/>
      {LEADERS.map((p,i)=>(
        <div key={p.name} style={{display:"flex",alignItems:"center",gap:12,marginBottom:8,background:i===0?"rgba(255,214,0,0.06)":C.card,border:`1px solid ${i===0?"rgba(255,214,0,0.18)":"rgba(57,255,20,0.09)"}`,borderRadius:12,padding:"12px 16px"}}>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,color:i===0?C.yellow:i===1?"#C0C0C0":i===2?"#CD7F32":C.muted,minWidth:26,lineHeight:1}}>
            {i<3?["👑","🥈","🥉"][i]:`#${p.rank}`}
          </div>
          <div style={{flex:1}}>
            <div style={{fontFamily:"'Oswald',sans-serif",fontSize:14,color:C.text,fontWeight:700}}>{p.name}</div>
            <div style={{fontFamily:"'Inter',sans-serif",fontSize:10,color:C.muted}}>{p.game}</div>
          </div>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:18,color:i===0?C.yellow:C.neon}}>{p.hours}Ч</div>
        </div>
      ))}
      <div style={{height:90}}/>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// APP ROOT
// ─────────────────────────────────────────────────────────────────────────────
export default function App(){
  const [tab,setTab]=useState("map");
  const [bookPC,setBookPC]=useState(null);
  const [showAdmin,setShowAdmin]=useState(false);
  const [showPinGate,setShowPinGate]=useState(false);
  const [logoTaps,setLogoTaps]=useState(0);
  const [logoTimer,setLogoTimer]=useState(null);
  const [menuCats,setMenuCats]=useState(MENU_CATS_DEFAULT);

  const [user,setUser]=useState(null);
  const [loading,setLoading]=useState(true);

  const [chatMsgs,setChatMsgs]=useState([]);
  const [chatUnread,setChatUnread]=useState(0);
  const [adminUnread,setAdminUnread]=useState(0);
  const chatPollRef=useRef(null);

  const [orders,setOrders]=useState([]);

  // Computers / zones / bookings (shared between map, book, admin)
  const [computers,setComputers]=useState([]);
  const [zones,setZones]=useState([]);
  const [bookings,setBookings]=useState([]);

  const [activeSession,setActiveSession]=useState(null);
  const [timeLeft,setTimeLeft]=useState(null);
  const timerRef=useRef(null);

  // ── LOAD COMPUTERS / ZONES / BOOKINGS ─────────────────────────────────────
  const loadInfra=useCallback(async()=>{
    const [{data:z},{data:c},{data:b}]=await Promise.all([
      sb.from("zones").select("*").order("sort_order",{ascending:true}),
      sb.from("computers").select("*").order("number",{ascending:true}),
      sb.from("bookings").select("*"),
    ]);
    if(z)setZones(z);
    if(c)setComputers(c);
    if(b)setBookings(b.filter(x=>x.status!=="cancelled"&&x.status!=="done"));
  },[]);

  useEffect(()=>{
    loadInfra();
    const t=setInterval(loadInfra,4000);
    return()=>clearInterval(t);
  },[loadInfra]);

  // ── INIT USER ─────────────────────────────────────────────────────────────
  useEffect(()=>{
    const init=async()=>{
      const tg=getTgUser();
      const {data:existing}=await sb.from("users").select("*").eq("id",tg.id).single();
      if(existing&&!existing.error){
        // Update name/username in case it changed in TG
        if(existing.first_name!==tg.first_name||existing.username!==tg.username){
          await sb.from("users").update({first_name:tg.first_name,username:tg.username}).eq("id",tg.id);
        }
        setUser(existing);
      } else {
        const newUser={id:tg.id,first_name:tg.first_name,username:tg.username,display_name:tg.first_name,balance:0,admin_note:""};
        await sb.from("users").insert(newUser);
        setUser(newUser);
      }
      setLoading(false);
    };
    init();
  },[]);

  // ── DERIVE ACTIVE SESSION FROM BOOKINGS ───────────────────────────────────
  useEffect(()=>{
    if(!user)return;
    const now=new Date();
    const myActive=bookings.find(b=>
      b.user_id===user.id&&
      new Date(b.starts_at)<=now&&new Date(b.ends_at)>now
    );
    if(myActive){
      setActiveSession({pc_number:myActive.pc_number,ends_at:myActive.ends_at,duration_hours:myActive.duration_hours,started_at:myActive.starts_at});
    } else {
      setActiveSession(null);
    }
  },[user,bookings]);

  // ── SESSION COUNTDOWN ─────────────────────────────────────────────────────
  useEffect(()=>{
    if(timerRef.current)clearInterval(timerRef.current);
    if(!activeSession){setTimeLeft(null);return;}
    const tick=()=>{
      const remaining=Math.max(0,Math.floor((new Date(activeSession.ends_at)-new Date())/1000));
      setTimeLeft(remaining);
      if(remaining===0){clearInterval(timerRef.current);setActiveSession(null);loadInfra();}
    };
    tick();
    timerRef.current=setInterval(tick,1000);
    return()=>clearInterval(timerRef.current);
  },[activeSession,loadInfra]);

  // ── LOAD CHAT (user side) ─────────────────────────────────────────────────
  const loadChat=useCallback(async()=>{
    if(!user)return;
    const {data}=await sb.from("messages").select("*").eq("user_id",user.id).order("created_at",{ascending:true}).limit(100);
    if(data){
      setChatMsgs(data.map(m=>({id:m.id,from:m.from_admin?"admin":"user",text:m.text,time:new Date(m.created_at).toLocaleTimeString("ru",{hour:"2-digit",minute:"2-digit"})})));
    }
  },[user]);

  useEffect(()=>{
    if(!user||showAdmin)return;
    loadChat();
    chatPollRef.current=setInterval(loadChat,3000);
    return()=>clearInterval(chatPollRef.current);
  },[user,loadChat,showAdmin]);

  // ── ADMIN: load orders, all users ─────────────────────────────────────────
  const loadOrders=async()=>{
    const {data}=await sb.from("orders").select("*").eq("status","pending").order("created_at",{ascending:false});
    if(data)setOrders(data.map(o=>({...o,pc:o.pc_number,payMethod:o.pay_method,time:new Date(o.created_at).toLocaleTimeString("ru",{hour:"2-digit",minute:"2-digit"})})));
  };
  const [allUsers,setAllUsers]=useState([]);
  const loadAllUsers=async()=>{
    const {data}=await sb.from("users").select("*").order("created_at",{ascending:false});
    if(data)setAllUsers(data);
  };
  useEffect(()=>{
    if(!showAdmin)return;
    loadOrders();loadAllUsers();loadInfra();
    const t=setInterval(()=>{loadOrders();loadAllUsers();loadInfra();},5000);
    return()=>clearInterval(t);
  },[showAdmin,loadInfra]);

  // ── 30-MIN BOOKING REMINDER CHECK ─────────────────────────────────────────
  useEffect(()=>{
    const checkReminders=async()=>{
      const now=new Date();
      for(const b of bookings){
        if(b.notified_30min)continue;
        const starts=new Date(b.starts_at);
        const minsUntil=(starts-now)/60000;
        if(minsUntil>0&&minsUntil<=30){
          await sb.from("bookings").update({notified_30min:true}).eq("id",b.id);
          sendBotMessage(b.user_id,`🔔 <b>Напоминание!</b>\n\nЧерез ${Math.round(minsUntil)} мин у тебя бронь ПК #${b.pc_number}\nНе опаздывай! 👾`);
        }
      }
    };
    const t=setInterval(checkReminders,60000);
    return()=>clearInterval(t);
  },[bookings]);

  // ── HANDLERS ─────────────────────────────────────────────────────────────
  const handleUserSend=async(text)=>{
    if(!user)return;
    await sb.from("messages").insert({user_id:user.id,from_admin:false,text});
    setAdminUnread(u=>u+1);
    loadChat();
  };

  const handleAdminSend=async(text,targetUserId)=>{
    if(!targetUserId)return;
    await sb.from("messages").insert({user_id:targetUserId,from_admin:true,text});
    // Notify user in their TG private chat
    sendBotMessage(targetUserId,`💬 <b>Сообщение от администратора:</b>\n\n${text}`);
  };

  const handleBalanceChange=async(delta)=>{
    if(!user)return;
    const newBal=Math.max(0,(user.balance||0)+delta);
    await sb.from("users").update({balance:newBal}).eq("id",user.id);
    setUser(u=>({...u,balance:newBal}));
  };

  const handleOrderNotify=async(pc,total,payMethod,items)=>{
    if(!user)return;
    await sb.from("orders").insert({user_id:user.id,pc_number:pc,items,total,pay_method:payMethod,status:"pending"});
    const itemList=items.map(i=>`${i.emoji} ${i.name} ×${i.qty}`).join(", ");
    await sb.from("messages").insert({user_id:user.id,from_admin:false,text:`🛵 ЗАКАЗ к ПК #${pc} | ${itemList} | ${total} руб | ${payMethod==="balance"?"💳 баланс":"💵 наличные"}`});
    setAdminUnread(u=>u+1);
    loadChat();
  };

  const handleDeliverOrder=async(id)=>{
    await sb.from("orders").update({status:"delivered"}).eq("id",id);
    setOrders(o=>o.filter(x=>x.id!==id));
  };

  const handleTopupUser=async(targetUserId,amount)=>{
    const target=allUsers.find(u=>u.id===targetUserId);
    if(!target)return;
    const newBal=(target.balance||0)+amount;
    await sb.from("users").update({balance:newBal}).eq("id",targetUserId);
    await sb.from("topups").insert({user_id:targetUserId,amount,note:"Пополнение от админа"});
    setAllUsers(us=>us.map(u=>u.id===targetUserId?{...u,balance:newBal}:u));
    if(user&&user.id===targetUserId)setUser(u=>({...u,balance:newBal}));
    // Notify user
    sendBotMessage(targetUserId,`💳 <b>Баланс пополнен!</b>\n\n+${amount} руб\nТекущий баланс: ${newBal} руб 🎮`);
  };

  // Called by BookScreen when booking starts now → notify + refresh
  const handleBookSession=async(pcNumber,durationHours,starts,ends)=>{
    if(!user)return;
    await loadInfra();
    // Send confirmation to TG
    const startStr=new Date(starts).toLocaleString("ru",{day:"numeric",month:"long",hour:"2-digit",minute:"2-digit"});
    sendBotMessage(user.id,`✅ <b>Бронь подтверждена!</b>\n\nПК #${pcNumber}\n🕐 ${startStr}\n⏱ ${durationHours} ч.\n\nЖдём тебя! 👾`);
  };

  // Generic booking confirmation (also for future bookings)
  const notifyBookingCreated=async(pcNumber,durationHours,starts)=>{
    if(!user)return;
    const startStr=new Date(starts).toLocaleString("ru",{day:"numeric",month:"long",hour:"2-digit",minute:"2-digit"});
    sendBotMessage(user.id,`✅ <b>Бронь подтверждена!</b>\n\nПК #${pcNumber}\n🕐 ${startStr}\n⏱ ${durationHours} ч.\n\n🔔 Напомним за 30 мин до старта`);
    await loadInfra();
  };

  const handleLogoTap=()=>{
    if(logoTimer)clearTimeout(logoTimer);
    const newTaps=logoTaps+1;
    setLogoTaps(newTaps);
    if(newTaps>=5){setShowPinGate(true);setLogoTaps(0);return;}
    const t=setTimeout(()=>setLogoTaps(0),2000);
    setLogoTimer(t);
  };

  const handleTabChange=(t)=>{
    setTab(t);
    if(t!=="book")setBookPC(null);
    if(t==="chat")setChatUnread(0);
  };

  const navTab=["map","book","menu","chat","profile"].includes(tab)?tab:"map";
  const balance=user?.balance||0;

  if(loading) return(
    <>
      <GlobalStyle/>
      <div style={{height:"100vh",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16}}>
        <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:40,color:C.neon,letterSpacing:"0.04em",textShadow:`0 0 20px ${C.neonGlow}`}} className="glitch">
          <span style={{color:C.neon}}>LEVEL</span> UP
        </div>
        <div style={{display:"flex",gap:8}}>
          {[0,1,2].map(i=><div key={i} style={{width:8,height:8,borderRadius:"50%",background:C.neon,animation:`blink 1.2s ${i*0.3}s infinite`}}/>)}
        </div>
        <div style={{fontFamily:"'Oswald',sans-serif",fontSize:12,color:C.muted,letterSpacing:"0.2em"}}>ПОДКЛЮЧЕНИЕ...</div>
      </div>
    </>
  );

  return(
    <>
      <GlobalStyle/>
      <div style={{
        height:"100vh",background:C.bg,color:C.text,
        fontFamily:"'Inter',system-ui,sans-serif",
        maxWidth:430,margin:"0 auto",
        display:"flex",flexDirection:"column",
        position:"relative",overflow:"hidden",
      }}>
        <div style={{position:"absolute",inset:0,background:"repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(57,255,20,0.011) 2px,rgba(57,255,20,0.011) 4px)",pointerEvents:"none",zIndex:0}}/>

        <div style={{position:"relative",zIndex:1,display:"flex",flexDirection:"column",flex:1,minHeight:0}}>
          <div onClick={handleLogoTap} style={{cursor:"default"}}>
            <Logo balance={balance} onBalanceTap={()=>handleTabChange("profile")}/>
          </div>
          <div style={{flex:1,display:"flex",flexDirection:"column",minHeight:0,position:"relative"}}>
            {tab==="map"&&<MapScreen onBook={(pc)=>{setBookPC(pc);setTab("book");}} computers={computers} zones={zones} bookings={bookings}/>}
            {tab==="book"&&<BookScreen preSelected={bookPC} onSessionBooked={handleBookSession} onBookingCreated={notifyBookingCreated} computers={computers} zones={zones} bookings={bookings} user={user}/>}
            {tab==="menu"&&<MenuScreen balance={balance} onBalanceChange={handleBalanceChange} onOrderNotify={handleOrderNotify} menuCats={menuCats} activeSession={activeSession}/>}
            {tab==="chat"&&<ChatScreen msgs={chatMsgs} onUserSend={handleUserSend} onRead={()=>setChatUnread(0)} adminTyping={false}/>}
            {tab==="profile"&&<ProfileScreen user={user} balance={balance} activeSession={activeSession} timeLeft={timeLeft}/>}
            {tab==="tariffs"&&<TariffsScreen/>}
            {tab==="events"&&<EventsScreen/>}
          </div>
        </div>

        <BottomNav active={navTab} onChange={handleTabChange} chatUnread={chatUnread}/>

        {showPinGate&&!showAdmin&&(
          <AdminPinGate
            onSuccess={()=>{setShowPinGate(false);setShowAdmin(true);}}
            onCancel={()=>setShowPinGate(false)}
          />
        )}
        {showAdmin&&(
          <AdminPanel
            onClose={()=>setShowAdmin(false)}
            orders={orders}
            onDeliverOrder={handleDeliverOrder}
            onTopupUser={handleTopupUser}
            onAdminSend={handleAdminSend}
            allUsers={allUsers}
            adminUnread={adminUnread}
            onAdminChatOpen={()=>setAdminUnread(0)}
            menuCats={menuCats}
            onMenuChange={setMenuCats}
            adminComputers={computers}
            adminZones={zones}
            adminBookings={bookings}
            onRefreshComputers={loadInfra}
          />
        )}
      </div>
    </>
  );
}
