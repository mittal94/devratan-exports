import { useState, useEffect, useMemo, useCallback } from "react";

const SUPABASE_URL = "https://jqbagmezerzgewxaqtpt.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxYmFnbWV6ZXJ6Z2V3eGFxdHB0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyMjMxMjIsImV4cCI6MjA5NTc5OTEyMn0.HAG23sw41cMXiyrnTC2-9dTZn5bO0oXMc69XKwB3IkU";

const sb = async (path, opts = {}) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", "Prefer": "return=representation", ...opts.headers },
    ...opts
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error_description || JSON.stringify(data));
  return data;
};

const authFetch = async (path, opts = {}, token) => {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${token || SUPABASE_KEY}`, "Content-Type": "application/json", ...opts.headers },
    ...opts
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.message || JSON.stringify(data));
  return data;
};

const COMPANY = { name: "DEVRATAN ENTERPRISES LLP", tagline: "We Create Not Produce", address: "Off No 206, II Floor, Indore Trade Center, Madhumilan Square, Indore MP 452001" };
const ALL_FYS = ["2020-21","2021-22","2022-23","2023-24","2024-25","2025-26","2026-27"];
const CURR_FY = "2026-27";
const BANKS = ["SBI","INDUSIND"];
const DEL_TERMS = ["CIF","FOB"];
const RODTEP_ST = ["Pending","Received","Error"];
const GST_ST = ["Pending","Received","Error"];
const COUNTRIES = ["Afghanistan","Albania","Algeria","Andorra","Angola","Argentina","Armenia","Australia","Austria","Azerbaijan","Bahamas","Bahrain","Bangladesh","Belarus","Belgium","Belize","Benin","Bhutan","Bolivia","Bosnia and Herzegovina","Botswana","Brazil","Brunei","Bulgaria","Cambodia","Cameroon","Canada","Chad","Chile","China","Colombia","Congo (DRC)","Costa Rica","Croatia","Cuba","Cyprus","Czech Republic","Denmark","Djibouti","Dominican Republic","Ecuador","Egypt","El Salvador","Estonia","Ethiopia","Fiji","Finland","France","Gabon","Gambia","Georgia","Germany","Ghana","Greece","Guatemala","Guinea","Haiti","Honduras","Hungary","Iceland","India","Indonesia","Iran","Iraq","Ireland","Israel","Italy","Ivory Coast","Jamaica","Japan","Jordan","Kazakhstan","Kenya","Kuwait","Laos","Latvia","Lebanon","Libya","Lithuania","Luxembourg","Madagascar","Malawi","Malaysia","Maldives","Mali","Malta","Mauritania","Mauritius","Mexico","Moldova","Mongolia","Morocco","Mozambique","Myanmar","Namibia","Nepal","Netherlands","New Zealand","Nicaragua","Niger","Nigeria","North Korea","Norway","Oman","Pakistan","Palestine","Panama","Paraguay","Peru","Philippines","Poland","Portugal","Qatar","Romania","Russia","Rwanda","Saudi Arabia","Senegal","Serbia","Sierra Leone","Singapore","Slovakia","Slovenia","Somalia","South Africa","South Korea","South Sudan","Spain","Sri Lanka","Sudan","Suriname","Sweden","Switzerland","Syria","Taiwan","Tajikistan","Tanzania","Thailand","Togo","Trinidad and Tobago","Tunisia","Turkey","Turkmenistan","Uganda","Ukraine","UAE","UK","USA","Uruguay","Uzbekistan","Venezuela","Vietnam","Yemen","Zambia","Zimbabwe"];

const getFY = d => { if(!d)return CURR_FY; const dt=new Date(d),y=dt.getFullYear(),m=dt.getMonth()+1; return m>=4?`${y}-${String(y+1).slice(2)}`:`${y-1}-${String(y).slice(2)}`; };
const n = v => Number(v)||0;
const fi = (v,d=2) => n(v).toLocaleString("en-IN",{minimumFractionDigits:d,maximumFractionDigits:d});
const fU = v => "$"+fi(v);
const fR = v => "₹"+fi(v);
const calcShip = s => { const inv=n(s.qty)*n(s.rate_per_mt); return { invoiceAmtUSD:inv, invoiceAmtINR:inv*n(s.exchange_rate), grossTotal:inv*n(s.exchange_rate)+n(s.igst), fobValueINR:n(s.fob_value_usd)*n(s.exchange_rate) }; };
const calcProfit = p => { const rice=n(p.rice_purchase_val),interest=rice*0.01,bankCh=n(p.payment_received_inr)*0.0011,totalFOB=n(p.cha_clearing)+n(p.shipping_line_charges)+n(p.inspect_agency)+n(p.coc_ectn)+n(p.other_exp),totalCIF=rice+n(p.pp_bags_purchase_val)+n(p.local_transport)+interest+bankCh+n(p.ocean_freight)+totalFOB; return {interest,bankCh,totalFOB,totalCIF,profit:n(p.payment_received_inr)-totalCIF}; };

const iS = {width:"100%",border:"1px solid #e2e8f0",borderRadius:7,padding:"7px 10px",fontSize:13,outline:"none",boxSizing:"border-box",background:"#f8fafc"};
const cS = {...iS,background:"#e0f2fe",color:"#0369a1",fontWeight:600,cursor:"not-allowed"};
const bMap = {Received:{bg:"#dcfce7",color:"#16a34a"},Pending:{bg:"#fef3c7",color:"#d97706"},Error:{bg:"#fee2e2",color:"#dc2626"},admin:{bg:"#dbeafe",color:"#1d4ed8"},accountant:{bg:"#f3e8ff",color:"#7c3aed"},viewer:{bg:"#f1f5f9",color:"#64748b"}};

const esc = v => `"${String(v??'').replace(/"/g,'""')}"`;
const toCSV = (h,r) => [h.map(esc).join(','),...r.map(x=>x.map(esc).join(','))].join('\n');
const dlCSV = (name,csv) => { const a=Object.assign(document.createElement('a'),{href:URL.createObjectURL(new Blob([csv],{type:'text/csv'})),download:name}); a.click(); };

const IMPORT_HDRS = ["Invoice No","Invoice Date (YYYY-MM-DD)","Buyer Name","Buyer Country","Product","Port of Loading","Port of Discharge","Shipping Bill No","Shipping Bill Date (YYYY-MM-DD)","Port Code","BL No","BL Date (YYYY-MM-DD)","Qty (MT)","Rate Per MT (USD)","Delivery Terms (CIF/FOB)","Exchange Rate","IGST (INR)","FOB Value (USD)","RODTEP Amount (INR)","RODTEP Status","GST Status","Remarks"];
const IMPORT_SAMPLE = [["INV-2627-001","2026-04-10","Sample Buyer","UAE","Basmati Rice 1121","Mundra","Dubai (Jebel Ali)","SB000001","2026-04-08","INMUN1","BL000001","2026-04-12","25","900","CIF","84.5","0","21000","18000","Pending","Pending",""]];

function Badge({val,map}){ const m=map||bMap,c=m[val]||{bg:"#f1f5f9",color:"#64748b"}; return <span style={{background:c.bg,color:c.color,borderRadius:20,padding:"3px 10px",fontSize:11,fontWeight:600,whiteSpace:"nowrap"}}>{val||"—"}</span>; }
function Row({l,v,bold,col}){ return <div style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:"1px solid #f8fafc",fontSize:12.5}}><span style={{color:"#64748b"}}>{l}</span><span style={{fontWeight:bold?700:600,color:col||"#1e293b"}}>{v}</span></div>; }
function SH({t,color="#1e3a5f",bg="#f1f5f9"}){ return <div style={{fontSize:12.5,fontWeight:700,color,background:bg,borderRadius:6,padding:"6px 10px",marginBottom:10,marginTop:14}}>{t}</div>; }
function FYBar({selected,onChange,counts}){ return <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}><span style={{fontSize:12,fontWeight:600,color:"#64748b",whiteSpace:"nowrap"}}>FY:</span><div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{ALL_FYS.map(fy=><button key={fy} onClick={()=>onChange(fy)} style={{background:selected===fy?"linear-gradient(135deg,#1e3a5f,#16a34a)":"#f1f5f9",color:selected===fy?"#fff":"#64748b",border:"none",borderRadius:20,padding:"4px 11px",cursor:"pointer",fontWeight:selected===fy?700:500,fontSize:11.5,boxShadow:selected===fy?"0 2px 8px rgba(30,58,95,0.25)":"none"}}>FY {fy}{counts[fy]>0?` (${counts[fy]})`:"" }</button>)}</div></div>; }
function Logo({size=36}){ return <img src="https://raw.githubusercontent.com/mittal94/devratan-exports/refs/heads/main/Devratan%20Enterprises%20Logo_2_Devratan%20Enterprises%20Logo_2.svg" alt="Devratan" width={size} height={size} style={{objectFit:"contain"}}/> }

function ShareModal({text,onClose}){
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:12}}>
      <div style={{background:"#fff",borderRadius:14,padding:24,width:"100%",maxWidth:500,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}><h3 style={{margin:0,color:"#1e3a5f"}}>📤 Share Summary</h3><button onClick={onClose} style={{background:"#f1f5f9",border:"none",borderRadius:6,padding:"5px 12px",cursor:"pointer",fontWeight:600}}>✕</button></div>
        <textarea readOnly value={text} onClick={e=>e.target.select()} style={{...iS,height:180,resize:"none",fontFamily:"monospace",fontSize:12}}/>
        <p style={{fontSize:11,color:"#94a3b8",margin:"4px 0 12px"}}>Click text to select all, then copy.</p>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
          <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer" style={{display:"block",background:"#25d366",color:"#fff",borderRadius:8,padding:"10px 0",textAlign:"center",fontWeight:700,fontSize:13,textDecoration:"none"}}>📱 WhatsApp</a>
          <a href={`mailto:?subject=Shipment Summary&body=${encodeURIComponent(text)}`} style={{display:"block",background:"#1e3a5f",color:"#fff",borderRadius:8,padding:"10px 0",textAlign:"center",fontWeight:700,fontSize:13,textDecoration:"none"}}>📧 Email</a>
        </div>
        <button onClick={()=>{navigator.clipboard&&navigator.clipboard.writeText(text);alert("Copied!");}} style={{width:"100%",background:"#f1f5f9",color:"#374151",border:"none",borderRadius:8,padding:"9px 0",cursor:"pointer",fontWeight:600,fontSize:13}}>📋 Copy to Clipboard</button>
      </div>
    </div>
  );
}

function UserModal({users,onClose,onRefresh}){
  const [form,setForm]=useState({name:"",email:"",role:"viewer",password:""});
  const [loading,setLoading]=useState(false);
  const [msg,setMsg]=useState("");
  const [editId,setEditId]=useState(null);
  const saveUser=async()=>{
    if(!form.name||!form.email){setMsg("Name and email required.");return;}
    setLoading(true);
    try{
      if(editId){
        await sb(`users?id=eq.${editId}`,{method:"PATCH",body:JSON.stringify({name:form.name,role:form.role})});
        setMsg("✅ User updated!");
      }else{
        await authFetch("/auth/v1/admin/users",{method:"POST",headers:{"apikey":SUPABASE_KEY,"Authorization":`Bearer ${SUPABASE_KEY}`},body:JSON.stringify({email:form.email,password:form.password||"Devratan@2526",email_confirm:true})});
        await sb("users",{method:"POST",body:JSON.stringify({name:form.name,email:form.email,role:form.role})});
        setMsg("✅ User created! Password: "+(form.password||"Devratan@2526"));
      }
      setForm({name:"",email:"",role:"viewer",password:""});setEditId(null);onRefresh();
    }catch(e){setMsg("Error: "+e.message);}
    setLoading(false);
  };
  const deleteUser=async(id,email)=>{
    if(!window.confirm(`Delete ${email}?`))return;
    setLoading(true);
    try{await sb(`users?id=eq.${id}`,{method:"DELETE"});setMsg("✅ Deleted.");onRefresh();}
    catch(e){setMsg("Error: "+e.message);}
    setLoading(false);
  };
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:12}}>
      <div style={{background:"#fff",borderRadius:14,padding:24,width:"100%",maxWidth:680,maxHeight:"93vh",overflow:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><h3 style={{margin:0,color:"#1e3a5f"}}>👥 User Management</h3><button onClick={onClose} style={{background:"#f1f5f9",border:"none",borderRadius:6,padding:"5px 12px",cursor:"pointer",fontWeight:600}}>✕</button></div>
        <SH t="Current Users"/>
        {users.map(u=>(
          <div key={u.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",background:"#f8fafc",borderRadius:8,marginBottom:8,flexWrap:"wrap",gap:8}}>
            <div><div style={{fontWeight:600,color:"#1e293b",fontSize:13}}>{u.name}</div><div style={{fontSize:12,color:"#64748b"}}>{u.email}</div></div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <Badge val={u.role}/>
              <button onClick={()=>{setEditId(u.id);setForm({name:u.name,email:u.email,role:u.role,password:""});}} style={{background:"#dbeafe",color:"#1d4ed8",border:"none",borderRadius:5,padding:"3px 10px",cursor:"pointer",fontSize:12}}>Edit</button>
              <button onClick={()=>deleteUser(u.id,u.email)} style={{background:"#fee2e2",color:"#dc2626",border:"none",borderRadius:5,padding:"3px 10px",cursor:"pointer",fontSize:12}}>Delete</button>
            </div>
          </div>
        ))}
        <SH t={editId?"✏️ Edit User":"➕ Add New User"}/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
          {[["name","Full Name","text"],["email","Email","email"],["password","Password (default: Devratan@2526)","password"]].map(([k,l,t])=>(
            <div key={k}><label style={{fontSize:11.5,fontWeight:600,color:"#374151",display:"block",marginBottom:3}}>{l}</label><input type={t} value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} style={iS} disabled={editId&&k==="email"}/></div>
          ))}
          <div><label style={{fontSize:11.5,fontWeight:600,color:"#374151",display:"block",marginBottom:3}}>Role</label><select value={form.role} onChange={e=>setForm(f=>({...f,role:e.target.value}))} style={iS}><option value="admin">Admin</option><option value="accountant">Accountant</option><option value="viewer">Viewer</option></select></div>
        </div>
        {msg&&<div style={{background:msg.includes("Error")?"#fee2e2":"#dcfce7",color:msg.includes("Error")?"#dc2626":"#16a34a",borderRadius:8,padding:"10px 14px",fontSize:13,marginBottom:12}}>{msg}</div>}
        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
          {editId&&<button onClick={()=>{setEditId(null);setForm({name:"",email:"",role:"viewer",password:""}); }} style={{background:"#f1f5f9",color:"#64748b",border:"none",borderRadius:8,padding:"8px 16px",cursor:"pointer",fontWeight:600}}>Cancel</button>}
          <button onClick={saveUser} disabled={loading} style={{background:"linear-gradient(135deg,#1e3a5f,#16a34a)",color:"#fff",border:"none",borderRadius:8,padding:"8px 22px",cursor:"pointer",fontWeight:700}}>{loading?"Saving...":editId?"Update":"Add User"}</button>
        </div>
      </div>
    </div>
  );
}

function ChangePasswordModal({token,onClose}){
  const [form,setForm]=useState({newPass:"",confirm:""});
  const [msg,setMsg]=useState("");
  const [loading,setLoading]=useState(false);
  const save=async()=>{
    if(form.newPass.length<8){setMsg("Min 8 characters.");return;}
    if(form.newPass!==form.confirm){setMsg("Passwords do not match.");return;}
    setLoading(true);
    try{await authFetch("/auth/v1/user",{method:"PUT",body:JSON.stringify({password:form.newPass})},token);setMsg("✅ Password changed!");setTimeout(onClose,2000);}
    catch(e){setMsg("Error: "+e.message);}
    setLoading(false);
  };
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:12}}>
      <div style={{background:"#fff",borderRadius:14,padding:24,width:"100%",maxWidth:420,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><h3 style={{margin:0,color:"#1e3a5f"}}>🔑 Change Password</h3><button onClick={onClose} style={{background:"#f1f5f9",border:"none",borderRadius:6,padding:"5px 12px",cursor:"pointer",fontWeight:600}}>✕</button></div>
        {[["newPass","New Password","password"],["confirm","Confirm Password","password"]].map(([k,l,t])=>(
          <div key={k} style={{marginBottom:12}}><label style={{fontSize:11.5,fontWeight:600,color:"#374151",display:"block",marginBottom:3}}>{l}</label><input type={t} value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} style={iS}/></div>
        ))}
        {msg&&<div style={{background:msg.includes("Error")?"#fee2e2":"#dcfce7",color:msg.includes("Error")?"#dc2626":"#16a34a",borderRadius:8,padding:"10px 14px",fontSize:13,marginBottom:12}}>{msg}</div>}
        <button onClick={save} disabled={loading} style={{width:"100%",background:"linear-gradient(135deg,#1e3a5f,#16a34a)",color:"#fff",border:"none",borderRadius:8,padding:"10px 0",cursor:"pointer",fontWeight:700}}>{loading?"Saving...":"Change Password"}</button>
      </div>
    </div>
  );
}

function BCModal({bc,allShips,onSave,onClose,saving}){
  const mkIRM=()=>({id:Date.now()+Math.random(),irmNo:"",irmDate:"",irmAmtUSD:"",exchangeRate:"",irmAmtINR:0});
  const mkBRC=()=>({id:Date.now()+Math.random(),brcNo:"",brcDate:"",brcAmtUSD:""});
  const [form,setForm]=useState(()=>{
    if(bc){return{...bc,irm_entries:bc.irm_entries?.map(i=>({id:i.id,irmNo:i.irm_no,irmDate:i.irm_date,irmAmtUSD:i.irm_amt_usd,exchangeRate:i.exchange_rate,irmAmtINR:i.irm_amt_inr}))||[mkIRM()],brc_entries:bc.brc_entries?.map(b=>({id:b.id,brcNo:b.brc_no,brcDate:b.brc_date,brcAmtUSD:b.brc_amt_usd}))||[mkBRC()]};}
    return{id:null,bank_name:"SBI",bc_no:"",bc_date:"",linked_invoices:[],irm_entries:[mkIRM()],brc_entries:[mkBRC()],total_amt_usd:0,total_amt_inr:0};
  });
  const sf=(k,v)=>setForm(f=>({...f,[k]:v}));
  const updIRM=(id,k,v)=>setForm(f=>({...f,irm_entries:f.irm_entries.map(i=>{if(i.id!==id)return i;const u={...i,[k]:v};if(k==="irmAmtUSD"||k==="exchangeRate")u.irmAmtINR=n(k==="irmAmtUSD"?v:u.irmAmtUSD)*n(k==="exchangeRate"?v:u.exchangeRate);return u;})}));
  const updBRC=(id,k,v)=>setForm(f=>({...f,brc_entries:f.brc_entries.map(b=>b.id!==id?b:{...b,[k]:v})}));
  const togInv=inv=>sf("linked_invoices",form.linked_invoices?.includes(inv)?form.linked_invoices.filter(x=>x!==inv):[...(form.linked_invoices||[]),inv]);
  const totUSD=form.irm_entries?.reduce((s,i)=>s+n(i.irmAmtUSD),0)||0;
  const totINR=form.irm_entries?.reduce((s,i)=>s+n(i.irmAmtINR),0)||0;
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:12}}>
      <div style={{background:"#fff",borderRadius:14,padding:24,width:"100%",maxWidth:820,maxHeight:"95vh",overflow:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.35)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}><h3 style={{margin:0,color:"#1e3a5f",fontSize:17}}>{bc?"✏️ Edit":"➕ Create"} Bill Collection</h3><button onClick={onClose} style={{background:"#f1f5f9",border:"none",borderRadius:6,padding:"5px 12px",cursor:"pointer",fontWeight:600}}>✕</button></div>
        <SH t="🏦 Collection Details"/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
          <div><label style={{fontSize:11.5,fontWeight:600,color:"#374151",display:"block",marginBottom:3}}>Bank</label><select value={form.bank_name||"SBI"} onChange={e=>sf("bank_name",e.target.value)} style={iS}>{BANKS.map(b=><option key={b}>{b}</option>)}</select></div>
          <div><label style={{fontSize:11.5,fontWeight:600,color:"#374151",display:"block",marginBottom:3}}>BC No *</label><input value={form.bc_no||""} onChange={e=>sf("bc_no",e.target.value)} style={iS}/></div>
          <div><label style={{fontSize:11.5,fontWeight:600,color:"#374151",display:"block",marginBottom:3}}>BC Date</label><input type="date" value={form.bc_date||""} onChange={e=>sf("bc_date",e.target.value)} style={iS}/></div>
        </div>
        <SH t="🔗 Linked Invoices"/>
        <div style={{display:"flex",flexWrap:"wrap",gap:8}}>{allShips.map(s=>{const lk=form.linked_invoices?.includes(s.invoice_no);return<button key={s.id} onClick={()=>togInv(s.invoice_no)} style={{background:lk?"#1e3a5f":"#f1f5f9",color:lk?"#fff":"#64748b",border:lk?"none":"1px solid #e2e8f0",borderRadius:20,padding:"4px 12px",cursor:"pointer",fontSize:12,fontWeight:lk?700:400}}>{s.invoice_no}</button>;})}</div>
        <SH t="💵 IRM Entries"/>
        {form.irm_entries?.map((irm,idx)=>(
          <div key={irm.id} style={{background:"#f8fafc",borderRadius:10,padding:14,marginBottom:10,border:"1px solid #e2e8f0"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}><span style={{fontWeight:700,color:"#1e3a5f",fontSize:13}}>IRM #{idx+1}</span>{form.irm_entries.length>1&&<button onClick={()=>setForm(f=>({...f,irm_entries:f.irm_entries.filter(i=>i.id!==irm.id)}))} style={{background:"#fee2e2",color:"#dc2626",border:"none",borderRadius:5,padding:"3px 9px",cursor:"pointer",fontSize:11}}>Remove</button>}</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              {[["irmNo","IRM No","text"],["irmDate","IRM Date","date"],["irmAmtUSD","IRM Amt (USD)","number"],["exchangeRate","Exchange Rate","number"]].map(([k,l,t])=><div key={k}><label style={{fontSize:11.5,fontWeight:600,color:"#374151",display:"block",marginBottom:3}}>{l}</label><input type={t} value={irm[k]||""} onChange={e=>updIRM(irm.id,k,e.target.value)} style={iS} step={t==="number"?"any":undefined}/></div>)}
              <div><label style={{fontSize:11.5,fontWeight:600,color:"#0369a1",display:"block",marginBottom:3}}>IRM Amt (INR) — Auto</label><input readOnly value={fR(irm.irmAmtINR||0)} style={cS}/></div>
            </div>
          </div>
        ))}
        <button onClick={()=>setForm(f=>({...f,irm_entries:[...f.irm_entries,mkIRM()]}))} style={{background:"#eff6ff",color:"#1d4ed8",border:"1px solid #bfdbfe",borderRadius:6,padding:"5px 12px",cursor:"pointer",fontSize:12,fontWeight:600,marginBottom:4}}>+ Add IRM</button>
        <SH t="📄 BRC Entries"/>
        {form.brc_entries?.map((brc,idx)=>(
          <div key={brc.id} style={{background:"#f8fafc",borderRadius:10,padding:14,marginBottom:10,border:"1px solid #e2e8f0"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}><span style={{fontWeight:700,color:"#1e3a5f",fontSize:13}}>BRC #{idx+1}</span>{form.brc_entries.length>1&&<button onClick={()=>setForm(f=>({...f,brc_entries:f.brc_entries.filter(b=>b.id!==brc.id)}))} style={{background:"#fee2e2",color:"#dc2626",border:"none",borderRadius:5,padding:"3px 9px",cursor:"pointer",fontSize:11}}>Remove</button>}</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>{[["brcNo","BRC No","text"],["brcDate","BRC Date","date"],["brcAmtUSD","BRC Amt (USD)","number"]].map(([k,l,t])=><div key={k}><label style={{fontSize:11.5,fontWeight:600,color:"#374151",display:"block",marginBottom:3}}>{l}</label><input type={t} value={brc[k]||""} onChange={e=>updBRC(brc.id,k,e.target.value)} style={iS} step={t==="number"?"any":undefined}/></div>)}</div>
          </div>
        ))}
        <button onClick={()=>setForm(f=>({...f,brc_entries:[...f.brc_entries,mkBRC()]}))} style={{background:"#eff6ff",color:"#1d4ed8",border:"1px solid #bfdbfe",borderRadius:6,padding:"5px 12px",cursor:"pointer",fontSize:12,fontWeight:600}}>+ Add BRC</button>
        <div style={{background:"#1e3a5f",borderRadius:10,padding:14,marginTop:16,display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <div><div style={{fontSize:11,color:"#94a3b8",marginBottom:2}}>Total Received (USD)</div><div style={{fontSize:20,fontWeight:700,color:"#fff"}}>{fU(totUSD)}</div></div>
          <div><div style={{fontSize:11,color:"#94a3b8",marginBottom:2}}>Total Received (INR)</div><div style={{fontSize:20,fontWeight:700,color:"#86efac"}}>{fR(totINR)}</div></div>
        </div>
        <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:20}}>
          <button onClick={onClose} style={{background:"#f1f5f9",color:"#64748b",border:"none",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontWeight:600}}>Cancel</button>
          <button onClick={()=>{if(!form.bc_no){alert("BC No required.");return;}onSave({...form,total_amt_usd:totUSD,total_amt_inr:totINR});}} disabled={saving} style={{background:"linear-gradient(135deg,#1e3a5f,#16a34a)",color:"#fff",border:"none",borderRadius:8,padding:"8px 24px",cursor:"pointer",fontWeight:700}}>{saving?"Saving...":"Save BC"}</button>
        </div>
      </div>
    </div>
  );
}

function DetailModal({shipment,bc,onClose}){
  if(!shipment)return <span/>;
  const s=shipment,c=calcShip(s);
  const brcNos=bc?bc.brc_entries?.map(b=>b.brc_no).filter(Boolean).join(", "):"—";
  const brcDates=bc?bc.brc_entries?.map(b=>b.brc_date).filter(Boolean).join(", "):"—";
  const rows=[["FY",`FY ${getFY(s.invoice_date)}`],["Invoice Date",s.invoice_date],["Buyer",s.buyer_name],["Country",s.buyer_country],["Product",s.product],["Port of Loading",s.port_of_loading],["Port of Discharge",s.port_of_discharge],["SB No",s.shipping_bill_no],["SB Date",s.shipping_bill_date],["Port Code",s.port_code],["BL No",s.bl_no],["BL Date",s.bl_date],["Qty (MT)",fi(s.qty)],["Rate/MT",fi(s.rate_per_mt)],["Delivery Terms",s.delivery_terms],["Invoice Amt (USD)",fU(c.invoiceAmtUSD)],["Exchange Rate",fi(s.exchange_rate)],["Invoice Amt (INR)",fR(c.invoiceAmtINR)],["IGST (INR)",fR(s.igst)],["Gross Total (INR)",fR(c.grossTotal)],["FOB (USD)",fU(s.fob_value_usd)],["FOB (INR)",fR(c.fobValueINR)],["RODTEP (INR)",fR(s.rodtep_amount)],["RODTEP Status",s.rodtep_status],["GST Status",s.gst_status],["Bill Collection No",bc?bc.bc_no:"—"],["BC Date",bc?bc.bc_date:"—"],["BRC No(s)",brcNos],["BRC Date(s)",brcDates],["Payment Rcvd (USD)",bc?fU(bc.total_amt_usd):"—"],["Payment Rcvd (INR)",bc?fR(bc.total_amt_inr):"—"],["Balance (USD)",bc?fU(c.invoiceAmtUSD-bc.total_amt_usd):fU(c.invoiceAmtUSD)],["Remarks",s.remarks||"—"]];
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:150,padding:12}}>
      <div style={{background:"#fff",borderRadius:14,padding:24,width:"100%",maxWidth:680,maxHeight:"93vh",overflow:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><h3 style={{margin:0,color:"#1e3a5f"}}>📋 {s.invoice_no}</h3><button onClick={onClose} style={{background:"#f1f5f9",border:"none",borderRadius:6,padding:"5px 12px",cursor:"pointer",fontWeight:600}}>✕ Close</button></div>
        {rows.map(([l,v])=><div key={l} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #f1f5f9",fontSize:13}}><span style={{color:"#64748b"}}>{l}</span><span style={{fontWeight:600,color:"#1e293b",textAlign:"right",maxWidth:"55%"}}>{v}</span></div>)}
      </div>
    </div>
  );
}

function ProfitabilityContent({fy,fyProfits,canEdit,canDelete,openAddProfit,openEditProfit,onDelete}){
  const totP=fyProfits.reduce((a,p)=>{
    try{
      const c=calcProfit(p);
      a.invINR+=n(p.invoice_amt_inr);
      a.paidINR+=n(p.payment_received_inr);
      a.totalCIF+=c.totalCIF;
      a.profit+=c.profit;
    }catch(e){}
    return a;
  },{invINR:0,paidINR:0,totalCIF:0,profit:0});
  return(
    <>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10,marginBottom:16}}>
        {[{l:"Invoice Value (INR)",v:fR(totP.invINR),c:"#0369a1"},{l:"Payment Received (INR)",v:fR(totP.paidINR),c:"#15803d"},{l:"Total CIF Cost (INR)",v:fR(totP.totalCIF),c:"#d97706"},{l:"Net Profit (INR)",v:fR(totP.profit),c:totP.profit>=0?"#16a34a":"#dc2626"}].map((x,i)=>(
          <div key={i} style={{background:"#fff",borderRadius:10,padding:"12px",boxShadow:"0 1px 4px rgba(0,0,0,0.07)",borderTop:`3px solid ${x.c}`}}>
            <div style={{fontSize:14,fontWeight:700,color:x.c,wordBreak:"break-all"}}>{x.v}</div>
            <div style={{fontSize:11,color:"#64748b",marginTop:3}}>{x.l}</div>
          </div>
        ))}
      </div>
      {fyProfits.length===0
        ?<div style={{background:"#fff",borderRadius:12,padding:40,textAlign:"center",color:"#94a3b8"}}><div style={{fontSize:36,marginBottom:10}}>📊</div><div style={{fontSize:15,fontWeight:600,marginBottom:6}}>No entries for FY {fy}</div>{canEdit&&<button onClick={openAddProfit} style={{background:"linear-gradient(135deg,#1e3a5f,#16a34a)",color:"#fff",border:"none",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontWeight:600,marginTop:10}}>+ Add First Entry</button>}</div>
        :<div style={{display:"grid",gap:12}}>
          {fyProfits.map(p=>{
            const c=calcProfit(p);
            return(
              <div key={p.id} style={{background:"#fff",borderRadius:12,overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,0.07)"}}>
                <div style={{background:"linear-gradient(135deg,#1e3a5f,#1e5799)",padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
                  <div><span style={{fontWeight:700,color:"#fff",fontSize:13}}>{p.invoice_no}</span><span style={{marginLeft:8,fontSize:11,color:"#93c5fd"}}>{p.invoice_date} · {p.buyer_name}</span></div>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <div style={{textAlign:"right"}}><div style={{fontSize:10,color:"#93c5fd"}}>Net Profit</div><div style={{fontSize:16,fontWeight:700,color:c.profit>=0?"#86efac":"#fca5a5"}}>{fR(c.profit)}</div></div>
                    {canEdit&&<button onClick={()=>openEditProfit(p)} style={{background:"rgba(255,255,255,0.15)",color:"#fff",border:"none",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:600}}>Edit</button>}
                    {canDelete&&<button onClick={()=>onDelete(p.id)} style={{background:"rgba(220,38,38,0.3)",color:"#fca5a5",border:"none",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:11}}>Del</button>}
                  </div>
                </div>
                <div style={{padding:"10px 14px"}}>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:10}}>
                    <div><div style={{fontSize:10,fontWeight:700,color:"#0369a1",marginBottom:4,textTransform:"uppercase"}}>Revenue</div><Row l="Invoice Amt" v={fR(p.invoice_amt_inr)}/><Row l="Payment Rcvd" v={fR(p.payment_received_inr)}/></div>
                    <div><div style={{fontSize:10,fontWeight:700,color:"#d97706",marginBottom:4,textTransform:"uppercase"}}>Direct Costs</div><Row l="Rice Purchase" v={fR(p.rice_purchase_val)}/><Row l="PP Bags" v={fR(p.pp_bags_purchase_val)}/><Row l="Local Transport" v={fR(p.local_transport)}/><Row l="Interest (1%)" v={fR(c.interest)}/><Row l="Bank Ch (0.11%)" v={fR(c.bankCh)}/><Row l="Ocean Freight" v={fR(p.ocean_freight)}/></div>
                    <div><div style={{fontSize:10,fontWeight:700,color:"#7c3aed",marginBottom:4,textTransform:"uppercase"}}>FOB Costs</div><Row l="CHA & Clearing" v={fR(p.cha_clearing)}/><Row l="Shipping Line" v={fR(p.shipping_line_charges)}/><Row l="Inspection" v={fR(p.inspect_agency)}/><Row l="COC/ECTN" v={fR(p.coc_ectn)}/><Row l="Other" v={fR(p.other_exp)}/><Row l="Total FOB" v={fR(c.totalFOB)} bold col="#7c3aed"/></div>
                    <div><div style={{fontSize:10,fontWeight:700,color:"#1e3a5f",marginBottom:4,textTransform:"uppercase"}}>Summary</div><Row l="Total CIF" v={fR(c.totalCIF)} bold col="#d97706"/><Row l="Payment Rcvd" v={fR(p.payment_received_inr)} col="#15803d"/><Row l="Net Profit" v={fR(c.profit)} bold col={c.profit>=0?"#16a34a":"#dc2626"}/></div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      }
    </>
  );
}

function ProfitFormModal({fy,editId,form,calc,fyShips,setF,onSelectInvoice,onSave,onClose,saving}){
  const fld=(k,l)=>(<div key={k}><label style={{fontSize:11.5,fontWeight:600,color:"#374151",display:"block",marginBottom:3}}>{l}</label><input type="number" value={form[k]||""} onChange={e=>setF(k,e.target.value)} style={iS} step="any"/></div>);
  const ro=(l,v)=>(<div key={l}><label style={{fontSize:11.5,fontWeight:600,color:"#0369a1",display:"block",marginBottom:3}}>{l}</label><input readOnly value={v} style={cS}/></div>);
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:12}}>
      <div style={{background:"#fff",borderRadius:14,padding:22,width:"100%",maxWidth:780,maxHeight:"93vh",overflow:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <h3 style={{margin:"0 0 4px",color:"#1e3a5f",fontSize:15}}>{editId?"✏️ Edit":"➕ Add"} Profitability — FY {fy}</h3>
        <SH t="📋 Invoice *"/>
        <div style={{marginBottom:14}}>
          <select value={form.invoice_no||""} onChange={e=>onSelectInvoice(e.target.value)} style={{...iS,borderColor:form.invoice_no?"#e2e8f0":"#dc2626"}}>
            <option value="">— Select Invoice —</option>
            {fyShips.map(s=><option key={s.id}>{s.invoice_no}</option>)}
          </select>
        </div>
        <SH t="📥 Auto-filled (Read Only)" color="#0369a1" bg="#e0f2fe"/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
          {ro("Invoice Date",form.invoice_date||"—")}{ro("Buyer",form.buyer_name||"—")}{ro("Port of Discharge",form.port_of_discharge||"—")}{ro("Invoice Amt (INR)",fR(form.invoice_amt_inr))}{ro("Payment Rcvd (INR)",fR(form.payment_received_inr))}
        </div>
        <SH t="💰 Direct Costs (INR)" color="#d97706" bg="#fef3c7"/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
          {fld("rice_purchase_val","Rice Purchase Value")}{fld("pp_bags_purchase_val","PP Bags Purchase Value")}{fld("local_transport","Local Transport")}{ro("Interest (1%)",fR(calc.interest))}{ro("Bank Charges (0.11%)",fR(calc.bankCh))}{fld("ocean_freight","Ocean Freight")}
        </div>
        <SH t="🚢 FOB Cost Head (INR)" color="#7c3aed" bg="#f3e8ff"/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
          {fld("cha_clearing","CHA & Clearing")}{fld("shipping_line_charges","Shipping Line Charges")}{fld("inspect_agency","Inspection Agency")}{fld("coc_ectn","COC / ECTN")}{fld("other_exp","Other Exp")}{ro("Total FOB",fR(calc.totalFOB))}
        </div>
        <div style={{background:"#1e3a5f",borderRadius:10,padding:14,marginBottom:14,display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
          <div><div style={{fontSize:10,color:"#93c5fd",marginBottom:1}}>Total CIF</div><div style={{fontSize:16,fontWeight:700,color:"#fbbf24"}}>{fR(calc.totalCIF)}</div></div>
          <div><div style={{fontSize:10,color:"#93c5fd",marginBottom:1}}>Payment Rcvd</div><div style={{fontSize:16,fontWeight:700,color:"#fff"}}>{fR(form.payment_received_inr)}</div></div>
          <div><div style={{fontSize:10,color:"#93c5fd",marginBottom:1}}>Net Profit</div><div style={{fontSize:16,fontWeight:700,color:calc.profit>=0?"#86efac":"#fca5a5"}}>{fR(calc.profit)}</div></div>
        </div>
        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
          <button onClick={onClose} style={{background:"#f1f5f9",color:"#64748b",border:"none",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontWeight:600}}>Cancel</button>
          <button onClick={onSave} disabled={saving} style={{background:"linear-gradient(135deg,#1e3a5f,#16a34a)",color:"#fff",border:"none",borderRadius:8,padding:"8px 22px",cursor:"pointer",fontWeight:700}}>{saving?"Saving...":"Save Entry"}</button>
        </div>
      </div>
    </div>
  );
}

export default function App(){
  const [session,setSession]=useState(()=>{ try{ const s=localStorage.getItem("sb_session"); return s?JSON.parse(s):null; }catch{return null;} });
  const [userInfo,setUserInfo]=useState(()=>{ try{ const u=localStorage.getItem("sb_user"); return u?JSON.parse(u):null; }catch{return null;} });
  const [loginForm,setLoginForm]=useState({email:"",password:"",error:"",loading:false});
  const [tab,setTab]=useState("dashboard");
  const [fy,setFy]=useState(CURR_FY);
  const [ships,setShips]=useState([]);
  const [bcs,setBcs]=useState([]);
  const [profits,setProfits]=useState([]);
  const [users,setUsers]=useState([]);
  const [loading,setLoading]=useState(false);
  const [showShipForm,setShowShipForm]=useState(false);
  const [editShipId,setEditShipId]=useState(null);
  const [shipForm,setShipForm]=useState({});
  const [showBC,setShowBC]=useState(false);
  const [editBC,setEditBC]=useState(null);
  const [showProfit,setShowProfit]=useState(false);
  const [editProfitId,setEditProfitId]=useState(null);
  const [profitForm,setProfitForm]=useState({});
  const [viewShipId,setViewShipId]=useState(null);
  const [showUsers,setShowUsers]=useState(false);
  const [showChangePwd,setShowChangePwd]=useState(false);
  const [showImport,setShowImport]=useState(false);
  const [shareText,setShareText]=useState(null);
  const [deleteId,setDeleteId]=useState(null);
  const [search,setSearch]=useState("");
  const [sortCol,setSortCol]=useState("invoice_date");
  const [sortDir,setSortDir]=useState("desc");
  const [saving,setSaving]=useState(false);

  const doLogin=async()=>{
    if(!loginForm.email||!loginForm.password){setLoginForm(f=>({...f,error:"Email and password required."}));return;}
    setLoginForm(f=>({...f,loading:true,error:""}));
    try{
      const data=await authFetch("/auth/v1/token?grant_type=password",{method:"POST",body:JSON.stringify({email:loginForm.email,password:loginForm.password})});
      setSession(data);
      const uArr=await fetch(`${SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(loginForm.email)}&select=*`,{headers:{"apikey":SUPABASE_KEY,"Authorization":`Bearer ${SUPABASE_KEY}`,"Content-Type":"application/json"}}).then(r=>r.json());
      setUserInfo(uArr[0]||{name:loginForm.email,role:"admin"});
    }catch(e){setLoginForm(f=>({...f,error:"Invalid email or password.",loading:false}));}
  };
  const doLogout=()=>{setSession(null);setUserInfo(null);setShips([]);setBcs([]);setProfits([]);};

  const loadAll=useCallback(async()=>{
    if(!session)return;
    setLoading(true);
    try{
      const[s,b,p,u]=await Promise.all([
        sb("shipments?select=*&order=invoice_date.desc"),
        sb("bill_collections?select=*,irm_entries(*),brc_entries(*)"),
        sb("profitability?select=*&order=created_at.desc"),
        sb("users?select=*&order=name.asc"),
      ]);
      setShips(s||[]);setBcs(b||[]);setProfits(p||[]);setUsers(u||[]);
    }catch(e){console.error(e);}
    setLoading(false);
  },[session]);

  useEffect(()=>{loadAll();},[loadAll]);

  const canEdit=userInfo&&(userInfo.role==="admin"||userInfo.role==="accountant");
  const canDelete=userInfo&&userInfo.role==="admin";
  const isAdmin=userInfo&&userInfo.role==="admin";
  const getBC=s=>bcs.find(b=>b.id===s.bc_id)||null;

  const fyCounts=useMemo(()=>{const c={};ALL_FYS.forEach(f=>c[f]=0);ships.forEach(s=>{const f=getFY(s.invoice_date);if(c[f]!==undefined)c[f]++;});return c;},[ships]);
  const fyShips=useMemo(()=>ships.filter(s=>getFY(s.invoice_date)===fy),[ships,fy]);
  const fyProfits=useMemo(()=>profits.filter(p=>{const s=ships.find(x=>x.invoice_no===p.invoice_no);return s&&getFY(s.invoice_date)===fy;}),[profits,ships,fy]);

  const totals=useMemo(()=>fyShips.reduce((a,s)=>{
    const c=calcShip(s),bc=getBC(s);
    a.count++;a.invUSD+=c.invoiceAmtUSD;a.invINR+=c.invoiceAmtINR;
    a.fobUSD+=n(s.fob_value_usd);a.fobINR+=c.fobValueINR;a.gross+=c.grossTotal;
    a.paidUSD+=bc?bc.total_amt_usd:0;a.paidINR+=bc?bc.total_amt_inr:0;
    a.bal+=bc?c.invoiceAmtUSD-bc.total_amt_usd:c.invoiceAmtUSD;
    a.brcPend+=(!bc||bc.brc_entries?.every(b=>!b.brc_no))?1:0;
    a.rodPend+=s.rodtep_status==="Pending"?1:0;a.gstPend+=s.gst_status==="Pending"?1:0;
    return a;
  },{count:0,invUSD:0,invINR:0,fobUSD:0,fobINR:0,gross:0,paidUSD:0,paidINR:0,bal:0,brcPend:0,rodPend:0,gstPend:0}),[fyShips,bcs]);

  const allYears=useMemo(()=>ALL_FYS.map(f=>{const ss=ships.filter(s=>getFY(s.invoice_date)===f);return ss.reduce((a,s)=>{const c=calcShip(s),bc=getBC(s);a.count++;a.inv+=c.invoiceAmtUSD;a.fob+=n(s.fob_value_usd);a.paid+=bc?bc.total_amt_usd:0;a.bal+=bc?c.invoiceAmtUSD-bc.total_amt_usd:c.invoiceAmtUSD;return a;},{fy:f,count:0,inv:0,fob:0,paid:0,bal:0});}), [ships,bcs]);

  const filtered=useMemo(()=>{let s=[...fyShips];if(search)s=s.filter(x=>Object.values(x).join(" ").toLowerCase().includes(search.toLowerCase()));s.sort((a,b)=>{let av=a[sortCol],bv=b[sortCol];if(!isNaN(Number(av))){av=Number(av);bv=Number(bv);}return av<bv?(sortDir==="asc"?-1:1):av>bv?(sortDir==="asc"?1:-1):0;});return s;},[fyShips,search,sortCol,sortDir]);

  const EMPTY_SHIP={invoice_no:"",invoice_date:"",buyer_name:"",buyer_country:"",product:"",port_of_loading:"",port_of_discharge:"",shipping_bill_no:"",shipping_bill_date:"",port_code:"",bl_no:"",bl_date:"",qty:"",rate_per_mt:"",delivery_terms:"CIF",exchange_rate:"",igst:0,fob_value_usd:"",rodtep_amount:"",rodtep_status:"Pending",gst_status:"Pending",bc_id:null,remarks:""};
  const EMPTY_PROFIT={invoice_no:"",invoice_date:"",buyer_name:"",port_of_discharge:"",invoice_amt_inr:0,payment_received_inr:0,rice_purchase_val:"",pp_bags_purchase_val:"",local_transport:"",ocean_freight:"",cha_clearing:"",shipping_line_charges:"",inspect_agency:"",coc_ectn:"",other_exp:""};

  const openAddShip=()=>{setShipForm({...EMPTY_SHIP});setEditShipId(null);setShowShipForm(true);};
  const openEditShip=s=>{setShipForm({...s});setEditShipId(s.id);setShowShipForm(true);};
  const setSF=(k,v)=>setShipForm(f=>({...f,[k]:v}));
  const saveShip=async()=>{
    if(!shipForm.invoice_no||!shipForm.buyer_name){alert("Invoice No and Buyer Name required.");return;}
    setSaving(true);
    try{const payload={...shipForm};delete payload.id;delete payload.created_at;if(editShipId){await sb(`shipments?id=eq.${editShipId}`,{method:"PATCH",body:JSON.stringify(payload)});}else{await sb("shipments",{method:"POST",body:JSON.stringify(payload)});}await loadAll();setShowShipForm(false);}
    catch(e){alert("Error: "+e.message);}
    setSaving(false);
  };
  const deleteShip=async id=>{setSaving(true);try{await sb(`shipments?id=eq.${id}`,{method:"DELETE"});await loadAll();setDeleteId(null);}catch(e){alert("Error: "+e.message);}setSaving(false);};

  const openAddProfit=()=>{setProfitForm({...EMPTY_PROFIT});setEditProfitId(null);setShowProfit(true);};
  const openEditProfit=p=>{setProfitForm({...p});setEditProfitId(p.id);setShowProfit(true);};
  const setPF=(k,v)=>setProfitForm(f=>({...f,[k]:v}));
  const selectProfitInv=inv=>{const s=ships.find(x=>x.invoice_no===inv);if(!s){setPF("invoice_no",inv);return;}const bc=getBC(s),c=calcShip(s);setProfitForm(f=>({...f,invoice_no:inv,invoice_date:s.invoice_date,buyer_name:s.buyer_name,port_of_discharge:s.port_of_discharge,invoice_amt_inr:c.invoiceAmtINR,payment_received_inr:bc?bc.total_amt_inr:0}));};
  const saveProfit=async()=>{
    if(!profitForm.invoice_no){alert("Invoice No required.");return;}
    setSaving(true);
    try{const payload={...profitForm};delete payload.id;delete payload.created_at;if(editProfitId){await sb(`profitability?id=eq.${editProfitId}`,{method:"PATCH",body:JSON.stringify(payload)});}else{await sb("profitability",{method:"POST",body:JSON.stringify(payload)});}await loadAll();setShowProfit(false);}
    catch(e){alert("Error: "+e.message);}
    setSaving(false);
  };
  const deleteProfit=async id=>{if(!window.confirm("Delete?"))return;setSaving(true);try{await sb(`profitability?id=eq.${id}`,{method:"DELETE"});await loadAll();}catch(e){alert("Error: "+e.message);}setSaving(false);};

  const saveBC=async(bc)=>{
    setSaving(true);
    try{
      const{irm_entries,brc_entries,...bcData}=bc;let bcId=bc.id;
      if(bcs.find(b=>b.id===bc.id)){await sb(`bill_collections?id=eq.${bc.id}`,{method:"PATCH",body:JSON.stringify({...bcData,id:undefined,created_at:undefined})});await sb(`irm_entries?bc_id=eq.${bc.id}`,{method:"DELETE"});await sb(`brc_entries?bc_id=eq.${bc.id}`,{method:"DELETE"});}
      else{const res=await sb("bill_collections",{method:"POST",body:JSON.stringify({...bcData,id:undefined,created_at:undefined})});bcId=res[0]?.id||bc.id;}
      if(irm_entries?.length){await sb("irm_entries",{method:"POST",body:JSON.stringify(irm_entries.map(i=>({bc_id:bcId,irm_no:i.irmNo||i.irm_no,irm_date:i.irmDate||i.irm_date,irm_amt_usd:n(i.irmAmtUSD||i.irm_amt_usd),exchange_rate:n(i.exchangeRate||i.exchange_rate),irm_amt_inr:n(i.irmAmtINR||i.irm_amt_inr)})))});}
      if(brc_entries?.length){await sb("brc_entries",{method:"POST",body:JSON.stringify(brc_entries.map(b=>({bc_id:bcId,brc_no:b.brcNo||b.brc_no,brc_date:b.brcDate||b.brc_date,brc_amt_usd:n(b.brcAmtUSD||b.brc_amt_usd)})))});}
      await loadAll();setShowBC(false);setEditBC(null);
    }catch(e){alert("Error: "+e.message);}
    setSaving(false);
  };

  const doImport=rows=>{
    const ex=new Set(ships.map(s=>s.invoice_no));
    const nr=rows.filter(r=>!ex.has(r.invoice_no));
    Promise.all(nr.map(r=>sb("shipments",{method:"POST",body:JSON.stringify(r)}))).then(()=>{loadAll();setShowImport(false);alert(`✅ Imported ${nr.length} new shipment(s). ${rows.length-nr.length} duplicate(s) skipped.`);}).catch(e=>alert("Error: "+e.message));
  };

  const profitCalc=useMemo(()=>calcProfit(profitForm),[profitForm]);
  const shipCalc=useMemo(()=>calcShip(shipForm),[shipForm]);
  const selectedBC=bcs.find(b=>b.id===shipForm.bc_id)||null;
  const viewShip=ships.find(s=>s.id===viewShipId)||null;

  const shareShip=s=>{const c=calcShip(s),bc=getBC(s),bal=c.invoiceAmtUSD-(bc?bc.total_amt_usd:0);setShareText(`🌾 *${COMPANY.name}*\nShipment Summary\n${"─".repeat(35)}\nInvoice: *${s.invoice_no}*\nDate: ${s.invoice_date}\nBuyer: ${s.buyer_name} (${s.buyer_country})\nProduct: ${s.product}\nQty: ${s.qty} MT @ $${s.rate_per_mt}/MT | ${s.delivery_terms}\n${"─".repeat(35)}\nInvoice Amt: *${fU(c.invoiceAmtUSD)}*\nPayment Rcvd: *${bc?fU(bc.total_amt_usd):"—"}*\nBalance Due: *${fU(bal)}*\n${"─".repeat(35)}\nRODTEP: ${s.rodtep_status} | GST: ${s.gst_status}\nBRC: ${bc?bc.brc_entries?.map(b=>b.brc_no).join(", "):"Pending"}\n${"─".repeat(35)}\n${COMPANY.address}`);};
  const shareAll=()=>setShareText(`🌾 *${COMPANY.name}*\nFY ${fy} — Business Summary\n${"─".repeat(35)}\nShipments: ${totals.count}\nInvoice Value: *${fU(totals.invUSD)}*\nPayment Received: *${fU(totals.paidUSD)}*\nBalance Due: *${fU(totals.bal)}*\nBRC Pending: ${totals.brcPend} | RODTEP: ${totals.rodPend} | GST: ${totals.gstPend}\n${"─".repeat(35)}\n${COMPANY.address}`);

  const exportCSV=()=>{const hdrs=["Invoice No","Date","Buyer","Country","Product","Port Load","Port Disch","SB No","SB Date","BL No","BL Date","Qty","Rate/MT","Terms","Inv(USD)","ExRate","Inv(INR)","IGST","Gross(INR)","FOB(USD)","FOB(INR)","RODTEP","RODTEP St","GST St","BC No","BRC No(s)","Pmt(USD)","Pmt(INR)","Balance(USD)"];const rows=fyShips.map(s=>{const c=calcShip(s),bc=getBC(s),bal=c.invoiceAmtUSD-(bc?bc.total_amt_usd:0);return[s.invoice_no,s.invoice_date,s.buyer_name,s.buyer_country,s.product,s.port_of_loading,s.port_of_discharge,s.shipping_bill_no,s.shipping_bill_date,s.bl_no,s.bl_date,s.qty,s.rate_per_mt,s.delivery_terms,fi(c.invoiceAmtUSD),s.exchange_rate,fi(c.invoiceAmtINR),fi(s.igst),fi(c.grossTotal),fi(s.fob_value_usd),fi(c.fobValueINR),fi(s.rodtep_amount),s.rodtep_status,s.gst_status,bc?bc.bc_no:"",bc?bc.brc_entries?.map(b=>b.brc_no).join("; "):"",bc?fi(bc.total_amt_usd):"",bc?fi(bc.total_amt_inr):"",fi(bal)];});dlCSV(`Devratan_FY${fy}.csv`,toCSV(hdrs,rows));};

  const doSort=col=>{if(sortCol===col)setSortDir(d=>d==="asc"?"desc":"asc");else{setSortCol(col);setSortDir("asc");}};
  function Th({col,label,right}){return<th onClick={()=>doSort(col)} style={{padding:"9px 10px",textAlign:right?"right":"left",color:"#64748b",fontWeight:600,fontSize:11.5,borderBottom:"1px solid #e2e8f0",cursor:"pointer",whiteSpace:"nowrap",userSelect:"none",background:"#f8fafc"}}>{label}{sortCol===col?(sortDir==="asc"?" ↑":" ↓"):""}</th>;}

  const SHIP_SECTIONS=[{title:"📄 Invoice & Buyer",fields:[["invoice_no","Invoice No *","text"],["invoice_date","Invoice Date","date"],["buyer_name","Buyer Name *","text"],["buyer_country","Buyer Country","select",COUNTRIES]]},{title:"🚢 Shipping",fields:[["port_of_loading","Port of Loading","text"],["port_of_discharge","Port of Discharge","text"],["shipping_bill_no","Shipping Bill No","text"],["shipping_bill_date","SB Date","date"],["port_code","Port Code","text"],["bl_no","BL No","text"],["bl_date","BL Date","date"]]},{title:"💵 Commercial",fields:[["product","Product","text"],["delivery_terms","Delivery Terms","select",DEL_TERMS],["qty","Qty (MT)","number"],["rate_per_mt","Rate/MT (USD)","number"],["exchange_rate","Exchange Rate","number"],["igst","IGST (INR)","number"],["fob_value_usd","FOB Value (USD)","number"],["rodtep_amount","RODTEP Amt (INR)","number"],["rodtep_status","RODTEP Status","select",RODTEP_ST],["gst_status","GST Status","select",GST_ST]]}];

  if(!session)return(
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#1e3a5f 0%,#16a34a 100%)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"system-ui,sans-serif",padding:16}}>
      <div style={{background:"#fff",borderRadius:16,padding:32,width:"100%",maxWidth:380,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{textAlign:"center",marginBottom:24}}>
          <Logo size={64}/>
          <h2 style={{margin:"10px 0 2px",color:"#1e3a5f",fontSize:18,fontWeight:800}}>{COMPANY.name}</h2>
          <p style={{color:"#64748b",fontSize:11,margin:"0 0 4px",fontStyle:"italic"}}>{COMPANY.tagline}</p>
          <p style={{color:"#94a3b8",fontSize:10,margin:"0 0 16px"}}>{COMPANY.address}</p>
          <p style={{color:"#374151",fontSize:14,margin:0,fontWeight:700}}>Export Manager — Sign In</p>
        </div>
        <div style={{marginBottom:14}}><label style={{fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:4}}>Email</label><input type="email" value={loginForm.email} onChange={e=>setLoginForm(f=>({...f,email:e.target.value}))} style={iS} placeholder="your@email.com" onKeyDown={e=>e.key==="Enter"&&doLogin()}/></div>
        <div style={{marginBottom:16}}><label style={{fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:4}}>Password</label><input type="password" value={loginForm.password} onChange={e=>setLoginForm(f=>({...f,password:e.target.value}))} style={iS} onKeyDown={e=>e.key==="Enter"&&doLogin()}/></div>
        {loginForm.error&&<p style={{color:"#dc2626",fontSize:12,marginBottom:10}}>{loginForm.error}</p>}
        <button onClick={doLogin} disabled={loginForm.loading} style={{width:"100%",background:"linear-gradient(135deg,#1e3a5f,#16a34a)",color:"#fff",border:"none",borderRadius:8,padding:"12px 0",fontWeight:700,fontSize:15,cursor:"pointer"}}>{loginForm.loading?"Signing in...":"Sign In"}</button>
        <p style={{textAlign:"center",fontSize:11,color:"#64748b",marginTop:14}}>🔒 Secure · Cloud Database</p>
      </div>
    </div>
  );

  return(
    <div style={{minHeight:"100vh",background:"#f1f5f9",fontFamily:"system-ui,sans-serif"}}>

      {/* Header — 2 rows for mobile */}
      <div style={{background:"linear-gradient(135deg,#1e3a5f 0%,#1e5799 100%)",color:"#fff",boxShadow:"0 2px 12px rgba(0,0,0,0.2)"}}>
        {/* Row 1: Logo + User */}
        <div style={{padding:"8px 12px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <Logo size={32}/>
            <div>
              <div style={{fontWeight:800,fontSize:11,letterSpacing:0.3,lineHeight:1.2}}>{COMPANY.name}</div>
              <div style={{fontSize:9,opacity:0.7}}>{COMPANY.tagline}</div>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontSize:10,opacity:0.9}}>{userInfo?.name?.split(" ")[0]}</span>
            <span style={{background:"rgba(255,255,255,0.2)",borderRadius:4,padding:"1px 6px",fontSize:9}}>{userInfo?.role}</span>
            <button onClick={doLogout} style={{background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:10}}>Logout</button>
          </div>
        </div>
        {/* Row 2: Action buttons */}
        <div style={{padding:"0 12px 8px",display:"flex",gap:6,flexWrap:"wrap"}}>
          {canEdit&&<button onClick={()=>setShowImport(true)} style={{background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontSize:11,fontWeight:600}}>📥 Import</button>}
          {canEdit&&<button onClick={exportCSV} style={{background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontSize:11,fontWeight:600}}>📤 Export</button>}
          <button onClick={shareAll} style={{background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontSize:11,fontWeight:600}}>📱 Share</button>
          {isAdmin&&<button onClick={()=>setShowUsers(true)} style={{background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontSize:11,fontWeight:600}}>👥 Users</button>}
          <button onClick={()=>setShowChangePwd(true)} style={{background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontSize:11,fontWeight:600}}>🔑 Password</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{background:"#fff",borderBottom:"1px solid #e2e8f0",display:"flex",overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
        {[["dashboard","📊 Dashboard"],["shipments","📦 Register"],["profitability","💰 P&L"],["bcmanager","🏦 Bill Coll."]].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)} style={{background:"none",border:"none",borderBottom:tab===k?"3px solid #1e3a5f":"3px solid transparent",color:tab===k?"#1e3a5f":"#64748b",padding:"11px 14px",cursor:"pointer",fontWeight:tab===k?700:500,fontSize:12,whiteSpace:"nowrap",flex:"1 0 auto"}}>{l}</button>
        ))}
      </div>

      {loading&&<div style={{background:"#eff6ff",borderBottom:"1px solid #bfdbfe",padding:"8px 16px",fontSize:13,color:"#1d4ed8",textAlign:"center"}}>🔄 Loading data...</div>}

      <div style={{padding:"12px",maxWidth:1400,margin:"0 auto"}}>

        {/* DASHBOARD */}
        {tab==="dashboard"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:10,marginBottom:14}}>
              <div><h2 style={{margin:"0 0 2px",color:"#1e3a5f",fontSize:17}}>Dashboard</h2><p style={{margin:0,fontSize:11,color:"#64748b"}}>FY {fy} · Live cloud data</p></div>
              <FYBar selected={fy} onChange={setFy} counts={fyCounts}/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10,marginBottom:18}}>
              {[{l:"Total Shipments",v:totals.count,i:"📦",c:"#1e3a5f"},{l:"Invoice Value (USD)",v:fU(totals.invUSD),i:"🧾",c:"#0369a1"},{l:"Invoice Value (INR)",v:fR(totals.invINR),i:"₹",c:"#7c3aed"},{l:"FOB Value (USD)",v:fU(totals.fobUSD),i:"🚢",c:"#0891b2"},{l:"Payment Rcvd (USD)",v:fU(totals.paidUSD),i:"✅",c:"#16a34a"},{l:"Payment Rcvd (INR)",v:fR(totals.paidINR),i:"✅",c:"#15803d"},{l:"Balance Due (USD)",v:fU(totals.bal),i:"⏳",c:totals.bal>0?"#dc2626":"#16a34a"},{l:"BRC Pending",v:totals.brcPend,i:"🔴",c:"#d97706"},{l:"RODTEP Pending",v:totals.rodPend,i:"📋",c:"#d97706"},{l:"GST Pending",v:totals.gstPend,i:"📋",c:"#d97706"}].map((x,i)=>(
                <div key={i} style={{background:"#fff",borderRadius:10,padding:"12px",boxShadow:"0 1px 4px rgba(0,0,0,0.07)",borderLeft:`4px solid ${x.c}`}}>
                  <div style={{fontSize:16}}>{x.i}</div><div style={{fontSize:13,fontWeight:700,color:x.c,margin:"3px 0 2px",wordBreak:"break-all"}}>{x.v}</div><div style={{fontSize:10,color:"#64748b"}}>{x.l}</div>
                </div>
              ))}
            </div>
            <h3 style={{color:"#1e3a5f",marginBottom:8,fontSize:13}}>📅 Year-wise Summary</h3>
            <div style={{background:"#fff",borderRadius:12,overflow:"auto",boxShadow:"0 1px 4px rgba(0,0,0,0.07)",marginBottom:18}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead><tr style={{background:"#f8fafc"}}>{["FY","Ships","Invoice(USD)","Pmt(USD)","Balance"].map(h=><th key={h} style={{padding:"9px 10px",textAlign:h==="FY"||h==="Ships"?"left":"right",color:"#64748b",fontWeight:600,fontSize:11,borderBottom:"1px solid #e2e8f0",whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
                <tbody>{allYears.map(row=>(
                  <tr key={row.fy} onClick={()=>setFy(row.fy)} style={{borderBottom:"1px solid #f1f5f9",cursor:"pointer",background:fy===row.fy?"#eff6ff":"transparent"}}>
                    <td style={{padding:"8px 10px",fontWeight:700,color:fy===row.fy?"#1e3a5f":"#374151",whiteSpace:"nowrap"}}>{fy===row.fy&&"▶ "}FY {row.fy}{row.fy===CURR_FY&&<span style={{marginLeft:4,fontSize:9,background:"#dcfce7",color:"#16a34a",borderRadius:10,padding:"1px 5px"}}>Now</span>}</td>
                    <td style={{padding:"8px 10px"}}>{row.count||"—"}</td>
                    <td style={{padding:"8px 10px",textAlign:"right",fontWeight:600}}>{row.count>0?fU(row.inv):"—"}</td>
                    <td style={{padding:"8px 10px",textAlign:"right",color:"#16a34a"}}>{row.count>0?fU(row.paid):"—"}</td>
                    <td style={{padding:"8px 10px",textAlign:"right",color:row.bal>0?"#dc2626":"#16a34a"}}>{row.count>0?fU(row.bal):"—"}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <h3 style={{color:"#1e3a5f",marginBottom:8,fontSize:13}}>Recent Shipments — FY {fy}</h3>
            {fyShips.length===0?<div style={{background:"#fff",borderRadius:12,padding:24,textAlign:"center",color:"#94a3b8"}}>No shipments for FY {fy}.</div>:
            <div style={{background:"#fff",borderRadius:12,overflow:"auto",boxShadow:"0 1px 4px rgba(0,0,0,0.07)"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:500}}>
                <thead><tr style={{background:"#f8fafc"}}>{["Invoice No","Buyer","Inv.(USD)","Balance",""].map(h=><th key={h} style={{padding:"9px 10px",textAlign:"left",color:"#64748b",fontWeight:600,fontSize:11,borderBottom:"1px solid #e2e8f0"}}>{h}</th>)}</tr></thead>
                <tbody>{fyShips.slice(0,6).map(s=>{const c=calcShip(s),bc=getBC(s),bal=c.invoiceAmtUSD-(bc?bc.total_amt_usd:0);return(
                  <tr key={s.id} style={{borderBottom:"1px solid #f1f5f9"}}>
                    <td style={{padding:"8px 10px",fontWeight:600,color:"#1e3a5f",whiteSpace:"nowrap"}}>{s.invoice_no}</td>
                    <td style={{padding:"8px 10px"}}>{s.buyer_name}</td>
                    <td style={{padding:"8px 10px",fontWeight:600}}>{fU(c.invoiceAmtUSD)}</td>
                    <td style={{padding:"8px 10px",fontWeight:600,color:bal>0?"#dc2626":"#16a34a"}}>{fU(bal)}</td>
                    <td style={{padding:"8px 10px"}}><button onClick={()=>shareShip(s)} style={{background:"#f0fdf4",color:"#16a34a",border:"none",borderRadius:5,padding:"3px 8px",cursor:"pointer",fontSize:11}}>📱</button></td>
                  </tr>
                );})}
                </tbody>
              </table>
            </div>}
          </div>
        )}

        {/* SHIPMENT REGISTER */}
        {tab==="shipments"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:10,marginBottom:12}}>
              <div><h2 style={{margin:"0 0 2px",color:"#1e3a5f",fontSize:17}}>Shipment Register</h2><p style={{margin:0,fontSize:11,color:"#64748b"}}>FY {fy} · {fyShips.length} shipment(s)</p></div>
              <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                <FYBar selected={fy} onChange={f=>{setFy(f);setSearch("");}} counts={fyCounts}/>
                {canEdit&&<button onClick={openAddShip} style={{background:"linear-gradient(135deg,#1e3a5f,#16a34a)",color:"#fff",border:"none",borderRadius:8,padding:"7px 13px",cursor:"pointer",fontWeight:600,fontSize:12}}>+ Add</button>}
                <button onClick={exportCSV} style={{background:"#f0fdf4",color:"#15803d",border:"1px solid #bbf7d0",borderRadius:8,padding:"7px 11px",cursor:"pointer",fontWeight:600,fontSize:12}}>📤</button>
                <button onClick={loadAll} style={{background:"#eff6ff",color:"#1d4ed8",border:"1px solid #bfdbfe",borderRadius:8,padding:"7px 11px",cursor:"pointer",fontWeight:600,fontSize:12}}>🔄</button>
              </div>
            </div>
            <div style={{marginBottom:10}}><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search..." style={{...iS,fontSize:13}}/></div>
            {fyShips.length===0?<div style={{background:"#fff",borderRadius:12,padding:40,textAlign:"center",color:"#94a3b8",boxShadow:"0 1px 4px rgba(0,0,0,0.07)"}}><div style={{fontSize:36,marginBottom:10}}>📭</div><div style={{fontSize:15,fontWeight:600}}>No shipments for FY {fy}</div>{canEdit&&<button onClick={openAddShip} style={{background:"linear-gradient(135deg,#1e3a5f,#16a34a)",color:"#fff",border:"none",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontWeight:600,marginTop:12}}>+ Add First Shipment</button>}</div>:
            <>
              <div style={{background:"#fff",borderRadius:12,overflow:"auto",boxShadow:"0 1px 4px rgba(0,0,0,0.07)"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:2200}}>
                  <thead><tr>
                    <Th col="invoice_no" label="Invoice No"/><Th col="invoice_date" label="Date"/><Th col="buyer_name" label="Buyer"/><Th col="buyer_country" label="Country"/><Th col="product" label="Product"/><Th col="port_of_loading" label="Port Load"/><Th col="port_of_discharge" label="Port Disch"/><Th col="shipping_bill_no" label="SB No"/><Th col="shipping_bill_date" label="SB Date"/><Th col="port_code" label="Port Code"/><Th col="bl_no" label="BL No"/><Th col="bl_date" label="BL Date"/><Th col="qty" label="Qty(MT)" right/><Th col="rate_per_mt" label="Rate/MT" right/><Th col="delivery_terms" label="Terms"/><Th col="i1" label="Inv(USD)" right/><Th col="exchange_rate" label="ExRate" right/><Th col="i2" label="Inv(INR)" right/><Th col="igst" label="IGST" right/><Th col="i3" label="Gross(INR)" right/><Th col="fob_value_usd" label="FOB(USD)" right/><Th col="i4" label="FOB(INR)" right/><Th col="rodtep_amount" label="RODTEP(INR)" right/><Th col="rodtep_status" label="RODTEP"/><Th col="gst_status" label="GST"/><Th col="bc_no" label="BC No"/><Th col="bc_date" label="BC Date"/><Th col="brc_nos" label="BRC No(s)"/><Th col="brc_dates" label="BRC Dates"/><Th col="paid_usd" label="Pmt(USD)" right/><Th col="paid_inr" label="Pmt(INR)" right/><Th col="bal" label="Balance(USD)" right/>
                    {canEdit&&<th style={{padding:"9px 10px",color:"#64748b",fontWeight:600,fontSize:11,borderBottom:"1px solid #e2e8f0",background:"#f8fafc",whiteSpace:"nowrap"}}>Actions</th>}
                  </tr></thead>
                  <tbody>
                    {filtered.map(s=>{const c=calcShip(s),bc=getBC(s),bal=c.invoiceAmtUSD-(bc?bc.total_amt_usd:0),brcNos=bc?bc.brc_entries?.map(b=>b.brc_no).filter(Boolean).join(", "):"—",brcDts=bc?bc.brc_entries?.map(b=>b.brc_date).filter(Boolean).join(", "):"—";return(
                      <tr key={s.id} style={{borderBottom:"1px solid #f1f5f9"}} onDoubleClick={()=>setViewShipId(s.id)}>
                        <td style={{padding:"8px 10px",fontWeight:600,color:"#1e3a5f",whiteSpace:"nowrap"}}>{s.invoice_no}</td>
                        <td style={{padding:"8px 10px",color:"#64748b",whiteSpace:"nowrap"}}>{s.invoice_date}</td>
                        <td style={{padding:"8px 10px",whiteSpace:"nowrap"}}>{s.buyer_name}</td>
                        <td style={{padding:"8px 10px",color:"#64748b"}}>{s.buyer_country}</td>
                        <td style={{padding:"8px 10px",whiteSpace:"nowrap",color:"#64748b"}}>{s.product}</td>
                        <td style={{padding:"8px 10px",whiteSpace:"nowrap"}}>{s.port_of_loading}</td>
                        <td style={{padding:"8px 10px",whiteSpace:"nowrap"}}>{s.port_of_discharge}</td>
                        <td style={{padding:"8px 10px"}}>{s.shipping_bill_no}</td>
                        <td style={{padding:"8px 10px",color:"#64748b",whiteSpace:"nowrap"}}>{s.shipping_bill_date}</td>
                        <td style={{padding:"8px 10px"}}>{s.port_code}</td>
                        <td style={{padding:"8px 10px"}}>{s.bl_no}</td>
                        <td style={{padding:"8px 10px",color:"#64748b",whiteSpace:"nowrap"}}>{s.bl_date}</td>
                        <td style={{padding:"8px 10px",textAlign:"right"}}>{fi(s.qty)}</td>
                        <td style={{padding:"8px 10px",textAlign:"right"}}>{fi(s.rate_per_mt)}</td>
                        <td style={{padding:"8px 10px"}}><Badge val={s.delivery_terms} map={{CIF:{bg:"#dbeafe",color:"#1d4ed8"},FOB:{bg:"#f3e8ff",color:"#7c3aed"}}}/></td>
                        <td style={{padding:"8px 10px",textAlign:"right",fontWeight:600}}>{fU(c.invoiceAmtUSD)}</td>
                        <td style={{padding:"8px 10px",textAlign:"right"}}>{fi(s.exchange_rate)}</td>
                        <td style={{padding:"8px 10px",textAlign:"right"}}>{fR(c.invoiceAmtINR)}</td>
                        <td style={{padding:"8px 10px",textAlign:"right"}}>{fR(s.igst)}</td>
                        <td style={{padding:"8px 10px",textAlign:"right",fontWeight:600}}>{fR(c.grossTotal)}</td>
                        <td style={{padding:"8px 10px",textAlign:"right"}}>{fU(s.fob_value_usd)}</td>
                        <td style={{padding:"8px 10px",textAlign:"right"}}>{fR(c.fobValueINR)}</td>
                        <td style={{padding:"8px 10px",textAlign:"right"}}>{fR(s.rodtep_amount)}</td>
                        <td style={{padding:"8px 10px"}}><Badge val={s.rodtep_status}/></td>
                        <td style={{padding:"8px 10px"}}><Badge val={s.gst_status}/></td>
                        <td style={{padding:"8px 10px",whiteSpace:"nowrap"}}>{bc?<span style={{fontWeight:600,color:"#1e3a5f"}}>{bc.bc_no}</span>:<span style={{color:"#94a3b8",fontSize:11}}>—</span>}</td>
                        <td style={{padding:"8px 10px",color:"#64748b",whiteSpace:"nowrap"}}>{bc?bc.bc_date:"—"}</td>
                        <td style={{padding:"8px 10px",color:"#16a34a",fontWeight:600,whiteSpace:"nowrap"}}>{brcNos}</td>
                        <td style={{padding:"8px 10px",color:"#64748b",whiteSpace:"nowrap"}}>{brcDts}</td>
                        <td style={{padding:"8px 10px",textAlign:"right",color:"#16a34a",fontWeight:600}}>{bc?fU(bc.total_amt_usd):"—"}</td>
                        <td style={{padding:"8px 10px",textAlign:"right",color:"#15803d",fontWeight:600}}>{bc?fR(bc.total_amt_inr):"—"}</td>
                        <td style={{padding:"8px 10px",textAlign:"right",fontWeight:700,color:bal>0?"#dc2626":"#16a34a"}}>{fU(bal)}</td>
                        {canEdit&&<td style={{padding:"8px 10px",whiteSpace:"nowrap"}}>
                          <button onClick={()=>openEditShip(s)} style={{background:"#dbeafe",color:"#1d4ed8",border:"none",borderRadius:5,padding:"3px 8px",cursor:"pointer",fontSize:11,marginRight:3}}>Edit</button>
                          <button onClick={()=>shareShip(s)} style={{background:"#f0fdf4",color:"#16a34a",border:"none",borderRadius:5,padding:"3px 8px",cursor:"pointer",fontSize:11,marginRight:3}}>📱</button>
                          {canDelete&&<button onClick={()=>setDeleteId(s.id)} style={{background:"#fee2e2",color:"#dc2626",border:"none",borderRadius:5,padding:"3px 8px",cursor:"pointer",fontSize:11}}>Del</button>}
                        </td>}
                      </tr>
                    );})}
                  </tbody>
                </table>
              </div>
              <p style={{fontSize:11,color:"#94a3b8",marginTop:6}}>💡 Double-click any row for full details</p>
            </>}
          </div>
        )}

        {/* PROFITABILITY */}
        {tab==="profitability"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:10,marginBottom:14}}>
              <div><h2 style={{margin:"0 0 2px",color:"#1e3a5f",fontSize:17}}>Profitability Register</h2><p style={{margin:0,fontSize:11,color:"#64748b"}}>FY {fy}</p></div>
              <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                <FYBar selected={fy} onChange={setFy} counts={fyCounts}/>
                {canEdit&&<button onClick={openAddProfit} style={{background:"linear-gradient(135deg,#1e3a5f,#16a34a)",color:"#fff",border:"none",borderRadius:8,padding:"7px 13px",cursor:"pointer",fontWeight:600,fontSize:12}}>+ Add Entry</button>}
              </div>
            </div>
            <ProfitabilityContent fy={fy} fyProfits={fyProfits} canEdit={canEdit} canDelete={canDelete} openAddProfit={openAddProfit} openEditProfit={openEditProfit} onDelete={deleteProfit}/>
          </div>
        )}

        {/* BILL COLLECTIONS */}
        {tab==="bcmanager"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10,marginBottom:14}}>
              <div><h2 style={{margin:"0 0 2px",color:"#1e3a5f",fontSize:17}}>🏦 Bill Collections</h2><p style={{margin:0,fontSize:11,color:"#64748b"}}>{bcs.length} total</p></div>
              {canEdit&&<button onClick={()=>{setEditBC(null);setShowBC(true);}} style={{background:"linear-gradient(135deg,#1e3a5f,#16a34a)",color:"#fff",border:"none",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontWeight:600,fontSize:12}}>+ New BC</button>}
            </div>
            {bcs.length===0&&<div style={{background:"#fff",borderRadius:12,padding:32,textAlign:"center",color:"#94a3b8"}}>No bill collections yet.</div>}
            <div style={{display:"grid",gap:10}}>
              {bcs.map(bc=>(
                <div key={bc.id} style={{background:"#fff",borderRadius:12,padding:16,boxShadow:"0 1px 4px rgba(0,0,0,0.07)"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8,marginBottom:10}}>
                    <div><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}><span style={{fontWeight:700,color:"#1e3a5f",fontSize:14}}>{bc.bc_no}</span><Badge val={bc.bank_name} map={{SBI:{bg:"#dcfce7",color:"#16a34a"},INDUSIND:{bg:"#dbeafe",color:"#1d4ed8"}}}/></div><div style={{fontSize:11,color:"#64748b"}}>Date: {bc.bc_date} · {bc.linked_invoices?.join(", ")||"No invoice linked"}</div></div>
                    <div style={{display:"flex",gap:8,alignItems:"center"}}><div style={{textAlign:"right"}}><div style={{fontSize:16,fontWeight:700,color:"#16a34a"}}>{fU(bc.total_amt_usd)}</div><div style={{fontSize:11,color:"#15803d"}}>{fR(bc.total_amt_inr)}</div></div>{canEdit&&<button onClick={()=>{setEditBC(bc);setShowBC(true);}} style={{background:"#dbeafe",color:"#1d4ed8",border:"none",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:600}}>Edit</button>}</div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    <div><div style={{fontSize:10,fontWeight:700,color:"#64748b",marginBottom:4}}>IRM ENTRIES</div>{bc.irm_entries?.map((irm,i)=><div key={irm.id} style={{background:"#f8fafc",borderRadius:6,padding:"6px 8px",marginBottom:3,fontSize:11}}><div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontWeight:600}}>{irm.irm_no}</span><span style={{color:"#16a34a",fontWeight:600}}>{fU(irm.irm_amt_usd)}</span></div><div style={{color:"#64748b"}}>{irm.irm_date} · {fR(irm.irm_amt_inr)}</div></div>)}</div>
                    <div><div style={{fontSize:10,fontWeight:700,color:"#64748b",marginBottom:4}}>BRC ENTRIES</div>{bc.brc_entries?.map((brc,i)=><div key={brc.id} style={{background:"#f8fafc",borderRadius:6,padding:"6px 8px",marginBottom:3,fontSize:11}}><div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontWeight:600}}>{brc.brc_no||"—"}</span><span style={{color:"#0369a1",fontWeight:600}}>{fU(brc.brc_amt_usd)}</span></div><div style={{color:"#64748b"}}>Date: {brc.brc_date||"—"}</div></div>)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* SHIP FORM
