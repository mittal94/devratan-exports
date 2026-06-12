import { useState, useEffect, useMemo, useCallback, useRef } from "react";

const SUPABASE_URL = "https://jqbagmezerzgewxaqtpt.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxYmFnbWV6ZXJ6Z2V3eGFxdHB0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyMjMxMjIsImV4cCI6MjA5NTc5OTEyMn0.HAG23sw41cMXiyrnTC2-9dTZn5bO0oXMc69XKwB3IkU";
const R2_WORKER = "https://devratan-r2-worker.mittal94.workers.dev";
const APP_VERSION = "1.0.4"; // ← Increment this on every deployment to force logout all users

// ─── Document config ───────────────────────────────────────────────────────
const SHIP_DOCS = [
  {key:"master_file",       label:"Master File",              accept:".xls,.xlsm,.xlsx",          maxMB:10},
  {key:"signed_contract",   label:"Signed Contract",          accept:".pdf,.jpg,.jpeg",            maxMB:7},
  {key:"signed_proforma",   label:"Signed Proforma",          accept:".pdf,.jpg,.jpeg",            maxMB:3},
  {key:"export_invoice",    label:"Export/Custom Invoice",    accept:".pdf,.jpg,.jpeg",            maxMB:3},
  {key:"shipping_bill",     label:"Shipping Bill",            accept:".pdf,.jpg,.jpeg",            maxMB:5},
  {key:"commercial_invoice",label:"Commercial Invoice",       accept:".pdf,.jpg,.jpeg",            maxMB:3},
  {key:"packing_list",      label:"Packing List",             accept:".pdf,.jpg,.jpeg",            maxMB:2},
  {key:"bill_of_lading",    label:"Bill of Lading",           accept:".pdf,.jpg,.jpeg",            maxMB:10},
  {key:"phyto_certificate", label:"Phyto Certificate",        accept:".pdf,.jpg,.jpeg",            maxMB:3},
  {key:"fumigation_cert",   label:"Fumigation Certificate",   accept:".pdf,.jpg,.jpeg",            maxMB:3},
  {key:"health_certificate",label:"Health Certificate",       accept:".pdf,.jpg,.jpeg",            maxMB:2},
  {key:"cert_of_origin",    label:"Certificate of Origin",    accept:".pdf,.jpg,.jpeg",            maxMB:3},
  {key:"weight_quality",    label:"Weight & Quality Cert",    accept:".pdf,.jpg,.jpeg",            maxMB:3},
  {key:"insurance",         label:"Insurance",                accept:".pdf,.jpg,.jpeg",            maxMB:3},
  {key:"coc_ectn_doc",      label:"COC/ECTN",                 accept:".pdf,.jpg,.jpeg",            maxMB:3},
  {key:"pesticide_report",  label:"Pesticide Report",         accept:".pdf,.jpg,.jpeg",            maxMB:3},
  {key:"other_doc",         label:"Other",                    accept:".pdf,.jpg,.jpeg",            maxMB:5},
];

const BC_DOCS = [
  {key:"bc_ref_copy",        label:"BC Reference Copy",         accept:".pdf", maxMB:3},
  {key:"bc_swift_copy",      label:"SWIFT / Bank Advice Copy",  accept:".pdf", maxMB:3},
  {key:"bc_bank_statement",  label:"Bank Statement",            accept:".pdf", maxMB:5},
  {key:"bc_lc_copy",         label:"LC Copy (if applicable)",   accept:".pdf", maxMB:5},
];

const r2Upload = async (folder, docKey, file) => {
  const ext = file.name.split(".").pop();
  // Trim whitespace from folder/docKey to prevent %20 in R2 keys
  const cleanFolder = String(folder||"").trim();
  const cleanKey = String(docKey||"").trim();
  const key = `${cleanFolder}/${cleanKey}/${cleanKey}.${ext}`;
  console.log("r2Upload: PUT", `${R2_WORKER}/${key}`, "size:", file.size);
  const res = await fetch(`${R2_WORKER}/${key}`, {
    method:"PUT", headers:{"Content-Type":file.type||"application/octet-stream"},
    body: file
  });
  const respText = await res.text();
  console.log("r2Upload response:", res.status, respText.slice(0,200));
  if(!res.ok){
    throw new Error(`Upload failed (${res.status}): ${respText.slice(0,200)}`);
  }
  return key;
};

const r2Delete = async (key) => {
  const res = await fetch(`${R2_WORKER}/${key}`, {method:"DELETE"});
  if(!res.ok) throw new Error("Delete failed");
};

const r2List = async (folder) => {
  try {
    const cleanFolderL = String(folder||"").trim();
    const listUrl = `${R2_WORKER}/list/${cleanFolderL}`;
    console.log("r2List: GET", listUrl);
    const res = await fetch(listUrl);
    if(!res.ok){ console.warn("r2List non-ok:", res.status, "folder:", folder); return []; }
    const raw = await res.text();
    let data;
    try{ data = JSON.parse(raw); }catch(e){ console.warn("r2List parse error:", raw.slice(0,200)); return []; }
    const files = data.files||data.objects||data.items||data.keys||
                  (Array.isArray(data)?data:[]);
    return files.map(f => {
      if(typeof f === "string") f = {key: f};
      // key format from r2Upload: {folder}/{docKey}/{docKey}.{ext}
      // e.g. brc/SBIN001/brc_copy/brc_copy.pdf
      const key = f.key||f.name||f.Key||"";
      let docType = f.docType||"";
      if(!docType){
        const parts = key.split("/").filter(Boolean);
        if(parts.length >= 1){
          // Always use the filename base as docType — most reliable
          // Works for both: folder/docKey/docKey.ext AND folder/docKey.ext
          const filename = parts[parts.length-1]; // last segment = filename
          docType = filename.includes(".") ? filename.split(".").slice(0,-1).join(".") : filename;
        } else {
          docType = key;
        }
      }
      return {
        ...f,
        key,
        docType,
        size:     f.size||f.Size||f.ContentLength||0,
        uploaded: f.uploaded||f.LastModified||f.lastModified||"",
      };
    });
  } catch(e) { console.error("r2List error:", e); return []; }
};

const r2ViewUrl = (key) => `${R2_WORKER}/${key}`;

const sb = async (path, opts = {}) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", "Prefer": "return=representation" },
    method: opts.method || "GET",
    body: opts.body
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : [];
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
};

const authFetch = async (path, opts = {}) => {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
    method: opts.method || "GET",
    body: opts.body
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(data.error_description || data.message || JSON.stringify(data));
  return data;
};

const COMPANIES = {
  devratan: {
    id: "devratan",
    name: "DEVRATAN ENTERPRISES LLP",
    tagline: "We Create Not Produce",
    address: "Off No 206, II Floor, Indore Trade Center, Madhumilan Square, Indore MP 452001",
    phone: "+91-9111282828",
    email: "akshay@devratan.com",
    web: "www.devratan.com",
    gstin: "GSTIN: 23AARFD8883D1Z3  |  IEC: AARFD8883D  |  LLP IN: AAV-1622",
  },
  vjra: {
    id: "vjra",
    name: "VJRA GLOBAL TRADE FZE LLC",
    tagline: "We Create Not Produce",
    address: "Business Centre, Sharjah Publishing City Free Zone, Sharjah, UAE",
    phone: "+971-566552850",
    email: "vjraglobal@gmail.com",
    web: "",
    gstin: "",
  },
};
const COMPANY = COMPANIES.devratan; // default (used outside contracts)
const ALL_FYS = ["2020-21","2021-22","2022-23","2023-24","2024-25","2025-26","2026-27"];
const CURR_FY = "2026-27";
const BANKS = ["SBI","INDUSIND"];
const DEL_TERMS = ["CIF","FOB","FOB with COC","FOB with ECTN","FOB with COC and ECTN","CIF with COC","CIF with ECTN","CIF with COC and ECTN"];
const CONTAINER_TYPES = ["20' FCL","40' FCL","20' FCL & 40' FCL"];
const ALL_DOCS = [
  {key:"commercial_invoice",   label:"Commercial Invoice – 3 Original"},
  {key:"packing_list",         label:"Packing List – 3 Original"},
  {key:"bill_of_lading",       label:"Master Bill of Lading – 3 Original"},
  {key:"cert_of_origin",       label:"Certificate of Origin – 1 Original"},
  {key:"fumigation_cert",      label:"Certificate of Fumigation – 1 Original"},
  {key:"phyto_certificate",    label:"Phytosanitary Certificate – 1 Original"},
  {key:"insurance",            label:"Insurance Policy – 1 Original"},
  {key:"weight_quality",       label:"Weight & quality certificate – 1 Original"},
  {key:"pesticide_report",     label:"Pesticide Free Test Report – 1 Original"},
  {key:"ectn",                 label:"ECTN"},
  {key:"coc",                  label:"COC"},
  {key:"other_document",        label:"Other Document"},
];
const RODTEP_ST = ["Pending","Received","Error","NA"];
const GST_ST = ["Pending","Received","Error","NA"];
const COUNTRIES = ["Afghanistan","Albania","Algeria","Andorra","Angola","Argentina","Armenia","Australia","Austria","Azerbaijan","Bahamas","Bahrain","Bangladesh","Belarus","Belgium","Belize","Benin","Bhutan","Bolivia","Bosnia and Herzegovina","Botswana","Brazil","Brunei","Bulgaria","Cambodia","Cameroon","Canada","Chad","Chile","China","Colombia","Congo (DRC)","Costa Rica","Croatia","Cuba","Cyprus","Czech Republic","Denmark","Djibouti","Dominican Republic","Ecuador","Egypt","El Salvador","Estonia","Ethiopia","Fiji","Finland","France","Gabon","Gambia","Georgia","Germany","Ghana","Greece","Guatemala","Guinea","Haiti","Honduras","Hungary","Iceland","India","Indonesia","Iran","Iraq","Ireland","Israel","Italy","Ivory Coast","Jamaica","Japan","Jordan","Kazakhstan","Kenya","Kuwait","Laos","Latvia","Lebanon","Libya","Lithuania","Luxembourg","Madagascar","Malawi","Malaysia","Maldives","Mali","Malta","Mauritania","Mauritius","Mexico","Moldova","Mongolia","Morocco","Mozambique","Myanmar","Namibia","Nepal","Netherlands","New Zealand","Nicaragua","Niger","Nigeria","North Korea","Norway","Oman","Pakistan","Palestine","Panama","Paraguay","Peru","Philippines","Poland","Portugal","Qatar","Romania","Russia","Rwanda","Saudi Arabia","Senegal","Serbia","Sierra Leone","Singapore","Slovakia","Slovenia","Somalia","South Africa","South Korea","South Sudan","Spain","Sri Lanka","Sudan","Suriname","Sweden","Switzerland","Syria","Taiwan","Tajikistan","Tanzania","Thailand","Togo","Trinidad and Tobago","Tunisia","Turkey","Turkmenistan","Uganda","Ukraine","UAE","UK","USA","Uruguay","Uzbekistan","Venezuela","Vietnam","Yemen","Zambia","Zimbabwe"];

const getFY = d => { if(!d)return CURR_FY; const dt=new Date(d),y=dt.getFullYear(),m=dt.getMonth()+1; return m>=4?`${y}-${String(y+1).slice(2)}`:`${y-1}-${String(y).slice(2)}`; };
const n = v => Number(v)||0;
const fi = (v,d=2) => n(v).toLocaleString("en-IN",{minimumFractionDigits:d,maximumFractionDigits:d});
const fU = v => "$"+fi(v);
const fR = v => "₹"+fi(v);
const pdfINR = v => "INR "+fi(v);

const calcShip = s => {
  const inv = n(s.qty)*n(s.rate_per_mt);
  return { invoiceAmtUSD:inv, invoiceAmtINR:inv*n(s.exchange_rate), grossTotal:inv*n(s.exchange_rate)+n(s.igst), fobValueINR:n(s.fob_value_usd)*n(s.exchange_rate) };
};

const calcProfit = (p, ships) => {
  const rice=n(p.rice_purchase_val), interest=rice*0.01, bankCh=n(p.payment_received_inr)*0.0011;
  // qty_mt: use stored value, or look up from ships array, or fallback to 0
  const qtyMT = n(p.qty_mt) || (ships ? n((ships.find(s=>s.invoice_no===p.invoice_no)||{}).qty) : 0);
  const localBrokerage=qtyMT*100;
  const totalFOB=n(p.cha_clearing)+n(p.shipping_line_charges)+n(p.inspect_agency)+n(p.coc_ectn)+n(p.other_exp)+localBrokerage;
  const totalDirect=rice+n(p.pp_bags_purchase_val)+n(p.local_transport)+interest+bankCh+n(p.ocean_freight);
  const totalCIF=totalDirect+totalFOB;
  return { interest, bankCh, localBrokerage, totalFOB, totalDirect, totalCIF, profit:n(p.payment_received_inr)-totalCIF };
};

const iS = {width:"100%",border:"1px solid #e2e8f0",borderRadius:7,padding:"7px 10px",fontSize:13,outline:"none",boxSizing:"border-box",background:"#f8fafc"};
const cS = {...iS,background:"#e0f2fe",color:"#0369a1",fontWeight:600,cursor:"not-allowed"};
const bMap = {Received:{bg:"#dcfce7",color:"#16a34a"},Pending:{bg:"#fef3c7",color:"#d97706"},Error:{bg:"#fee2e2",color:"#dc2626"},NA:{bg:"#f1f5f9",color:"#64748b"},admin:{bg:"#dbeafe",color:"#1d4ed8"},accountant:{bg:"#f3e8ff",color:"#7c3aed"},senior_accountant:{bg:"#f3e8ff",color:"#7c3aed"},junior_accountant:{bg:"#fef9c3",color:"#854d0e"},viewer:{bg:"#f1f5f9",color:"#64748b"}};

const escv = v => `"${String(v??'').replace(/"/g,'""')}"`;
const toCSV = (h,r) => [h.map(escv).join(','),...r.map(x=>x.map(escv).join(','))].join('\n');
const dlCSV = (name,csv) => { const blob=new Blob(["\uFEFF"+csv],{type:'text/csv;charset=utf-8'}); const a=Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:name}); document.body.appendChild(a); a.click(); document.body.removeChild(a); };

// ─── PDF Export Helper ───────────────────────────────────────────────────────
const getDocx = () => {
  // docx 7.x UMD exposes window.docx
  const lib = window.docx || window.DocxJS || window.DOCX;
  if (lib && lib.Document && lib.Packer) return lib;
  // Fallback: try to find it anywhere on window
  const keys = Object.keys(window).filter(k => window[k] && window[k].Packer && window[k].Document);
  if (keys.length > 0) return window[keys[0]];
  console.error("docx library not found on window. Keys:", Object.keys(window).filter(k=>k.toLowerCase().includes("doc")));
  alert("Word library not loaded. Please hard-refresh the page (Ctrl+Shift+R) and try again.");
  return null;
};

const getPDF = () => {
  if(window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
  if(window.jsPDF) return window.jsPDF;
  return null;
};

const pdfHeader = (doc, title, subtitle) => {
  doc.setFillColor(30,58,95);
  doc.rect(0,0,210,28,'F');
  doc.setTextColor(255,255,255);
  doc.setFontSize(14);
  doc.setFont(undefined,'bold');
  doc.text(COMPANY.name, 14, 11);
  doc.setFontSize(9);
  doc.setFont(undefined,'normal');
  doc.text(COMPANY.tagline + " | " + COMPANY.address, 14, 17);
  doc.setFontSize(12);
  doc.setFont(undefined,'bold');
  doc.text(title, 14, 24);
  doc.setTextColor(0,0,0);
  doc.setFontSize(9);
  doc.setFont(undefined,'normal');
  if(subtitle) doc.text(subtitle, 14, 32);
  return subtitle ? 36 : 32;
};

const exportShipmentPDF = (s, bc) => {
  const JPDF = getPDF();
  if(!JPDF){ alert("PDF library not loaded. Please refresh the page."); return; }
  const doc = new JPDF({orientation:'portrait',unit:'mm',format:'a4'});
  const c = calcShip(s);
  const bal = c.invoiceAmtUSD - (bc ? bc.total_amt_usd : 0);
  let y = pdfHeader(doc, "Shipment Detail", `Invoice: ${s.invoice_no} | Date: ${s.invoice_date}`);
  y += 4;
  const rows = [
    ["FY", getFY(s.invoice_date)], ["Invoice No", s.invoice_no], ["Invoice Date", s.invoice_date||"—"],
    ["Buyer Name", s.buyer_name||"—"], ["Country", s.buyer_country||"—"], ["Product", s.product||"—"],
    ["Port of Loading", s.port_of_loading||"—"], ["Port of Discharge", s.port_of_discharge||"—"],
    ["Shipping Bill No", s.shipping_bill_no||"—"], ["SB Date", s.shipping_bill_date||"—"],
    ["Port Code", s.port_code||"—"], ["BL No", s.bl_no||"—"], ["BL Date", s.bl_date||"—"],
    ["Qty (MT)", fi(s.qty)], ["Rate/MT (USD)", fi(s.rate_per_mt)], ["Delivery Terms", s.delivery_terms||"—"],
    ["Invoice Amt (USD)", fU(c.invoiceAmtUSD)], ["Exchange Rate", fi(s.exchange_rate)],
    ["Invoice Amt (INR)", pdfINR(c.invoiceAmtINR)], ["IGST (INR)", pdfINR(s.igst)],
    ["Gross Total (INR)", pdfINR(c.grossTotal)], ["FOB Value (USD)", fU(s.fob_value_usd)],
    ["FOB Value (INR)", pdfINR(c.fobValueINR)], ["RODTEP Amt (INR)", pdfINR(s.rodtep_amount)],
    ["RODTEP Status", s.rodtep_status||"—"], ["GST Status", s.gst_status||"—"],
    ["Bill Collection No", bc?bc.bc_no:"—"], ["BC Date", bc?bc.bc_date:"—"],
    ["BRC No(s)", bc?bc.brc_entries?.map(b=>b.brc_no).filter(Boolean).join(", ")||"—":"—"],
    ["Payment Rcvd (USD)", bc?fU(bc.total_amt_usd):"—"],
    ["Payment Rcvd (INR)", bc?pdfINR(bc.total_amt_inr):"—"],
    ["Balance (USD)", fU(bal)], ["Remarks", s.remarks||"—"]
  ];
  doc.autoTable({
    startY: y, head: [["Field","Value"]], body: rows,
    styles:{fontSize:9,cellPadding:3},
    headStyles:{fillColor:[30,58,95],textColor:255,fontStyle:'bold'},
    alternateRowStyles:{fillColor:[241,245,249]},
    columnStyles:{0:{fontStyle:'bold',cellWidth:70},1:{cellWidth:110}},
    margin:{left:14,right:14}
  });
  doc.save(`Shipment_${s.invoice_no}.pdf`);
};

const exportProfitPDF = (p, allShipsForProfit) => {
  const JPDF = getPDF();
  if(!JPDF){ alert("PDF library not loaded. Please refresh the page."); return; }
  const doc = new JPDF({orientation:'portrait',unit:'mm',format:'a4'});
  const c = calcProfit(p, allShipsForProfit||[]);
  let y = pdfHeader(doc, "Profitability Entry", `Invoice: ${p.invoice_no} | Buyer: ${p.buyer_name||"—"}`);
  y += 4;
  const rows = [
    ["Invoice No", p.invoice_no], ["Invoice Date", p.invoice_date||"—"],
    ["Buyer Name", p.buyer_name||"—"], ["Port of Discharge", p.port_of_discharge||"—"],
    ["Invoice Amt (INR)", pdfINR(p.invoice_amt_inr)], ["Payment Received (INR)", pdfINR(p.payment_received_inr)],
    ["Rice Purchase Value", pdfINR(p.rice_purchase_val)], ["PP Bags Purchase", pdfINR(p.pp_bags_purchase_val)],
    ["Local Transport", pdfINR(p.local_transport)], ["Interest Cost (1%)", pdfINR(c.interest)],
    ["Bank Charges (0.11%)", pdfINR(c.bankCh)], ["Ocean Freight", pdfINR(p.ocean_freight)],
    ["CHA & Clearing", pdfINR(p.cha_clearing)], ["Shipping Line Charges", pdfINR(p.shipping_line_charges)],
    ["Inspection Agency", pdfINR(p.inspect_agency)], ["COC / ECTN", pdfINR(p.coc_ectn)],
    ["Other Expenses", pdfINR(p.other_exp)], ["Local Brokerage (INR 100/MT)", pdfINR(c.localBrokerage)], ["Total FOB Cost", pdfINR(c.totalFOB)], ["Total Direct Cost", pdfINR(c.totalDirect)],
    ["Total CIF Cost", pdfINR(c.totalCIF)], ["Net Profit", pdfINR(c.profit)]
  ];
  doc.autoTable({
    startY: y, head: [["Description","Amount"]], body: rows,
    styles:{fontSize:9,cellPadding:3},
    headStyles:{fillColor:[30,58,95],textColor:255,fontStyle:'bold'},
    alternateRowStyles:{fillColor:[241,245,249]},
    columnStyles:{0:{fontStyle:'bold',cellWidth:100},1:{cellWidth:80,halign:'right'}},
    margin:{left:14,right:14}
  });
  doc.save(`PL_${p.invoice_no}.pdf`);
};

const exportBCPDF = (bc) => {
  const JPDF = getPDF();
  if(!JPDF){ alert("PDF library not loaded. Please refresh the page."); return; }
  const doc = new JPDF({orientation:'portrait',unit:'mm',format:'a4'});
  let y = pdfHeader(doc, "Bill Collection", `BC No: ${bc.bc_no} | Bank: ${bc.bank_name} | Date: ${bc.bc_date||"—"}`);
  y += 4;
  doc.autoTable({
    startY: y, head: [["Field","Value"]],
    body: [
      ["BC No", bc.bc_no], ["Bank", bc.bank_name], ["BC Date", bc.bc_date||"—"],
      ["Linked Invoices", bc.linked_invoices?.join(", ")||"—"],
      ["Total Received (USD)", fU(bc.total_amt_usd)], ["Total Received (INR)", pdfINR(bc.total_amt_inr)]
    ],
    styles:{fontSize:9,cellPadding:3},
    headStyles:{fillColor:[30,58,95],textColor:255,fontStyle:'bold'},
    columnStyles:{0:{fontStyle:'bold',cellWidth:70},1:{cellWidth:110}},
    margin:{left:14,right:14}
  });
  let y2 = doc.lastAutoTable.finalY + 6;
  if(bc.irm_entries?.length){
    doc.setFontSize(10); doc.setFont(undefined,'bold'); doc.setTextColor(30,58,95);
    doc.text("IRM Entries", 14, y2); y2 += 4;
    doc.setTextColor(0,0,0); doc.setFont(undefined,'normal');
    doc.autoTable({
      startY: y2,
      head: [["IRM No","Date","Amt (USD)","Exch Rate","Intermediary (USD)","Amt (INR)"]],
      body: bc.irm_entries.map(i=>[i.irm_no||"—",i.irm_date||"—",fU(i.irm_amt_usd),fi(i.exchange_rate),fU(i.intermediary_charges_usd||0),pdfINR(i.irm_amt_inr)]),
      styles:{fontSize:8,cellPadding:3},
      headStyles:{fillColor:[3,105,161],textColor:255,fontStyle:'bold'},
      alternateRowStyles:{fillColor:[240,249,255]},
      margin:{left:14,right:14}
    });
    y2 = doc.lastAutoTable.finalY + 6;
  }
  if(bc.brc_entries?.length){
    doc.setFontSize(10); doc.setFont(undefined,'bold'); doc.setTextColor(30,58,95);
    doc.text("BRC Entries", 14, y2); y2 += 4;
    doc.setTextColor(0,0,0); doc.setFont(undefined,'normal');
    doc.autoTable({
      startY: y2,
      head: [["BRC No","Date","Amt (USD)"]],
      body: bc.brc_entries.map(b=>[b.brc_no||"—",b.brc_date||"—",fU(b.brc_amt_usd)]),
      styles:{fontSize:8,cellPadding:3},
      headStyles:{fillColor:[22,163,74],textColor:255,fontStyle:'bold'},
      alternateRowStyles:{fillColor:[240,253,244]},
      margin:{left:14,right:14}
    });
  }
  doc.save(`BC_${bc.bc_no}.pdf`);
};

// ─── Export Modal ─────────────────────────────────────────────────────────────
function ExportModal({ type, data, onClose, getBC }) {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [fmt, setFmt] = useState("csv");

  const filtered = useMemo(() => {
    if (!fromDate && !toDate) return data;
    return data.filter(item => {
      const d = item.invoice_date || item.bc_date || "";
      if (!d) return true;
      if (fromDate && d < fromDate) return false;
      if (toDate && d > toDate) return false;
      return true;
    });
  }, [data, fromDate, toDate]);

  const doExport = () => {
    if (type === "shipments") {
      if (fmt === "pdf") {
        exportShipmentsPDF(filtered, getBC);
      } else {
        const hdrs = ["Invoice No","Date","Buyer","Country","Product","Port Load","Port Disch","SB No","SB Date","Port Code","BL No","BL Date","Qty(MT)","Rate/MT(USD)","Terms","Inv(USD)","ExRate","Inv(INR)","IGST","Gross(INR)","FOB(USD)","FOB(INR)","RODTEP(INR)","RODTEP St","GST St","BC No","BC Bank","BRC No(s)","Pmt(USD)","Pmt(INR)","Balance(USD)"];
        const rows = filtered.map(s => {
          const c = calcShip(s), bc = getBC(s), bal = c.invoiceAmtUSD - (bc ? bc.total_amt_usd : 0);
          return [s.invoice_no,s.invoice_date,s.buyer_name,s.buyer_country,s.product,s.port_of_loading,s.port_of_discharge,s.shipping_bill_no,s.shipping_bill_date,s.port_code||"",s.bl_no,s.bl_date,s.qty,s.rate_per_mt,s.delivery_terms,fi(c.invoiceAmtUSD),s.exchange_rate,fi(c.invoiceAmtINR),fi(s.igst),fi(c.grossTotal),fi(s.fob_value_usd),fi(c.fobValueINR),fi(s.rodtep_amount),s.rodtep_status,s.gst_status,bc?bc.bc_no:"",bc?bc.bank_name:"",bc?bc.brc_entries?.map(b=>b.brc_no).join("; "):"",bc?fi(bc.total_amt_usd):"",bc?fi(bc.total_amt_inr):"",fi(bal)];
        });
        dlCSV(`Devratan_Shipments_${fromDate||"all"}_to_${toDate||"all"}.csv`, toCSV(hdrs, rows));
      }
    } else if (type === "profitability") {
      if (fmt === "pdf") {
        exportProfitListPDF(filtered);
      } else {
        const hdrs = ["Invoice No","Date","Buyer","Port Disch","Invoice(INR)","Pmt(INR)","Rice Purchase","PP Bags","Local Transport","Interest","Bank Charges","Ocean Freight","CHA Clearing","Shipping Line","Inspection","COC/ECTN","Other Exp","Total FOB","Total CIF","Net Profit"];
        const rows = filtered.map(p => {
          const c = calcProfit(p,ships);
          return [p.invoice_no,p.invoice_date,p.buyer_name,p.port_of_discharge,fi(p.invoice_amt_inr),fi(p.payment_received_inr),fi(p.rice_purchase_val),fi(p.pp_bags_purchase_val),fi(p.local_transport),fi(c.interest),fi(c.bankCh),fi(p.ocean_freight),fi(p.cha_clearing),fi(p.shipping_line_charges),fi(p.inspect_agency),fi(p.coc_ectn),fi(p.other_exp),fi(c.totalFOB),fi(c.totalCIF),fi(c.profit)];
        });
        dlCSV(`Devratan_PL_${fromDate||"all"}_to_${toDate||"all"}.csv`, toCSV(hdrs, rows));
      }
    } else if (type === "bc") {
      if (fmt === "pdf") {
        exportBCListPDF(filtered);
      } else {
        const hdrs = ["BC No","Bank","BC Date","Linked Invoices","Total (USD)","Total (INR)","IRM Nos","BRC Nos"];
        const rows = filtered.map(bc => [bc.bc_no,bc.bank_name,bc.bc_date||"",bc.linked_invoices?.join("; ")||"",fi(bc.total_amt_usd),fi(bc.total_amt_inr),bc.irm_entries?.map(i=>i.irm_no).join("; ")||"",bc.brc_entries?.map(b=>b.brc_no).join("; ")||""]);
        dlCSV(`Devratan_BC_${fromDate||"all"}_to_${toDate||"all"}.csv`, toCSV(hdrs, rows));
      }
    } else if (type === "dashboard") {
      exportDashboardPDF(data, getBC);
    }
    onClose();
  };

  const exportShipmentsPDF = (ships, getBC) => {
    const JPDF = getPDF();
    if(!JPDF){ alert("PDF library not loaded. Please refresh the page."); return; }
    const doc = new JPDF({orientation:'landscape',unit:'mm',format:'a4'});
    const dateRange = (fromDate||toDate) ? ` | ${fromDate||"Start"} to ${toDate||"End"}` : "";
    let y = pdfHeader(doc, "Shipment Register", `${ships.length} shipments${dateRange}`);
    y += 4;
    doc.autoTable({
      startY: y,
      head: [["Invoice No","Date","Buyer","Country","Qty(MT)","Rate/MT","Terms","Inv(USD)","FOB(USD)","RODTEP","BC No","Pmt(USD)","Balance"]],
      body: ships.map(s => {
        const c = calcShip(s), bc = getBC(s), bal = c.invoiceAmtUSD - (bc ? bc.total_amt_usd : 0);
        return [s.invoice_no,s.invoice_date,s.buyer_name,s.buyer_country,fi(s.qty,0),fi(s.rate_per_mt),s.delivery_terms,fU(c.invoiceAmtUSD),fU(s.fob_value_usd),s.rodtep_status,bc?bc.bc_no:"—",bc?fU(bc.total_amt_usd):"—",fU(bal)];
      }),
      styles:{fontSize:7,cellPadding:2},
      headStyles:{fillColor:[30,58,95],textColor:255,fontStyle:'bold'},
      alternateRowStyles:{fillColor:[241,245,249]},
      margin:{left:10,right:10}
    });
    doc.save(`Devratan_Shipments.pdf`);
  };

  const exportProfitListPDF = (profits) => {
    const JPDF = getPDF();
    if(!JPDF){ alert("PDF library not loaded. Please refresh the page."); return; }
    const doc = new JPDF({orientation:'landscape',unit:'mm',format:'a4'});
    let y = pdfHeader(doc, "Profitability Report", `${profits.length} entries`);
    y += 4;
    doc.autoTable({
      startY: y,
      head: [["Invoice No","Date","Buyer","Invoice(INR)","Pmt(INR)","Total CIF","Net Profit"]],
      body: profits.map(p => {
        const c = calcProfit(p,ships);
        return [p.invoice_no,p.invoice_date,p.buyer_name,pdfINR(p.invoice_amt_inr),pdfINR(p.payment_received_inr),pdfINR(c.totalCIF),pdfINR(c.profit)];
      }),
      styles:{fontSize:8,cellPadding:3},
      headStyles:{fillColor:[30,58,95],textColor:255,fontStyle:'bold'},
      alternateRowStyles:{fillColor:[241,245,249]},
      margin:{left:10,right:10}
    });
    doc.save(`Devratan_PL_Report.pdf`);
  };

  const exportBCListPDF = (bcs) => {
    const JPDF = getPDF();
    if(!JPDF){ alert("PDF library not loaded. Please refresh the page."); return; }
    const doc = new JPDF({orientation:'portrait',unit:'mm',format:'a4'});
    let y = pdfHeader(doc, "Bill Collections", `${bcs.length} records`);
    y += 4;
    doc.autoTable({
      startY: y,
      head: [["BC No","Bank","Date","Linked Invoices","Total (USD)","Total (INR)"]],
      body: bcs.map(bc => [bc.bc_no,bc.bank_name,bc.bc_date||"—",bc.linked_invoices?.join(", ")||"—",fU(bc.total_amt_usd),pdfINR(bc.total_amt_inr)]),
      styles:{fontSize:9,cellPadding:3},
      headStyles:{fillColor:[30,58,95],textColor:255,fontStyle:'bold'},
      alternateRowStyles:{fillColor:[241,245,249]},
      margin:{left:14,right:14}
    });
    doc.save(`Devratan_BC_Report.pdf`);
  };

  const exportDashboardPDF = (fyShips, getBC) => {
    const JPDF = getPDF();
    if(!JPDF){ alert("PDF library not loaded. Please refresh the page."); return; }
    const doc = new JPDF({orientation:'portrait',unit:'mm',format:'a4'});
    const totals = fyShips.reduce((a,s) => {
      const c = calcShip(s), bc = getBC(s);
      a.count++; a.invUSD+=c.invoiceAmtUSD; a.invINR+=c.invoiceAmtINR;
      a.fobUSD+=n(s.fob_value_usd); a.paidUSD+=bc?bc.total_amt_usd:0;
      a.paidINR+=bc?bc.total_amt_inr:0;
      a.bal+=bc?c.invoiceAmtUSD-bc.total_amt_usd:c.invoiceAmtUSD;
      a.rodPend+=s.rodtep_status==="Pending"?1:0; a.gstPend+=s.gst_status==="Pending"?1:0;
      return a;
    }, {count:0,invUSD:0,invINR:0,fobUSD:0,paidUSD:0,paidINR:0,bal:0,rodPend:0,gstPend:0});
    let y = pdfHeader(doc, "Dashboard Summary", `FY Summary | ${fyShips.length} shipments | Generated: ${new Date().toLocaleDateString('en-IN')}`);
    y += 4;
    doc.autoTable({
      startY: y, head: [["Metric","Value"]],
      body: [
        ["Total Shipments", String(totals.count)],
        ["Invoice Amount (USD)", fU(totals.invUSD)],
        ["Invoice Amount (INR)", pdfINR(totals.invINR)],
        ["FOB Value (USD)", fU(totals.fobUSD)],
        ["Payment Received (USD)", fU(totals.paidUSD)],
        ["Payment Received (INR)", pdfINR(totals.paidINR)],
        ["Outstanding Balance (USD)", fU(totals.bal)],
        ["RODTEP Pending", String(totals.rodPend)],
        ["GST Pending", String(totals.gstPend)]
      ],
      styles:{fontSize:10,cellPadding:4},
      headStyles:{fillColor:[30,58,95],textColor:255,fontStyle:'bold'},
      alternateRowStyles:{fillColor:[241,245,249]},
      columnStyles:{0:{fontStyle:'bold',cellWidth:120},1:{cellWidth:60,halign:'right'}},
      margin:{left:14,right:14}
    });
    y = doc.lastAutoTable.finalY + 8;
    if(fyShips.length > 0){
      doc.setFontSize(10); doc.setFont(undefined,'bold'); doc.setTextColor(30,58,95);
      doc.text("Shipment-wise Breakdown", 14, y); y += 4;
      doc.setTextColor(0,0,0); doc.setFont(undefined,'normal');
      doc.autoTable({
        startY: y,
        head: [["Invoice No","Date","Buyer","Inv(USD)","Pmt(USD)","Balance","RODTEP","GST"]],
        body: fyShips.map(s => {
          const c = calcShip(s), bc = getBC(s), bal = c.invoiceAmtUSD - (bc?bc.total_amt_usd:0);
          return [s.invoice_no,s.invoice_date,s.buyer_name,fU(c.invoiceAmtUSD),bc?fU(bc.total_amt_usd):"—",fU(bal),s.rodtep_status,s.gst_status];
        }),
        styles:{fontSize:8,cellPadding:2},
        headStyles:{fillColor:[22,163,74],textColor:255,fontStyle:'bold'},
        alternateRowStyles:{fillColor:[241,245,249]},
        margin:{left:14,right:14}
      });
    }
    doc.save(`Devratan_Dashboard.pdf`);
  };

  const showDateFilter = type !== "dashboard";
  const showFmt = type !== "dashboard";

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,padding:12}}>
      <div style={{background:"#fff",borderRadius:14,padding:22,width:"100%",maxWidth:440,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <h3 style={{margin:0,color:"#1e3a5f",fontSize:15}}>
            {type==="shipments"?"Export Shipments":type==="profitability"?"Export P&L":type==="bc"?"Export Bill Collections":"Export Dashboard"}
          </h3>
          <button onClick={onClose} style={{background:"#f1f5f9",border:"none",borderRadius:6,padding:"5px 12px",cursor:"pointer",fontWeight:600}}>✕</button>
        </div>

        {showFmt && (
          <div style={{marginBottom:14}}>
            <label style={{fontSize:11.5,fontWeight:600,color:"#374151",display:"block",marginBottom:6}}>Export Format</label>
            <div style={{display:"flex",gap:8}}>
              {["csv","pdf"].map(f => (
                <button key={f} onClick={()=>setFmt(f)} style={{flex:1,background:fmt===f?"#1e3a5f":"#f1f5f9",color:fmt===f?"#fff":"#374151",border:"none",borderRadius:8,padding:"8px 0",cursor:"pointer",fontWeight:600,fontSize:13}}>
                  {f==="csv"?"📊 CSV":"📄 PDF"}
                </button>
              ))}
            </div>
          </div>
        )}

        {showDateFilter && (
          <div style={{background:"#f8fafc",borderRadius:10,padding:12,marginBottom:14,border:"1px solid #e2e8f0"}}>
            <label style={{fontSize:11.5,fontWeight:600,color:"#374151",display:"block",marginBottom:8}}>Date Range Filter <span style={{fontWeight:400,color:"#94a3b8"}}>(optional — leave blank for all)</span></label>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div>
                <label style={{fontSize:11,color:"#64748b",display:"block",marginBottom:3}}>From Date</label>
                <input type="date" value={fromDate} onChange={e=>setFromDate(e.target.value)} style={iS}/>
              </div>
              <div>
                <label style={{fontSize:11,color:"#64748b",display:"block",marginBottom:3}}>To Date</label>
                <input type="date" value={toDate} onChange={e=>setToDate(e.target.value)} style={iS}/>
              </div>
            </div>
            {(fromDate||toDate) && (
              <div style={{marginTop:8,fontSize:12,color:"#0369a1",fontWeight:600}}>
                {filtered.length} record(s) match this date range
                <button onClick={()=>{setFromDate("");setToDate("");}} style={{marginLeft:8,background:"none",border:"none",color:"#dc2626",cursor:"pointer",fontSize:11}}>Clear</button>
              </div>
            )}
          </div>
        )}

        {type==="dashboard" && (
          <div style={{background:"#eff6ff",borderRadius:8,padding:10,marginBottom:14,fontSize:12,color:"#1d4ed8"}}>
            Exports a PDF summary of the dashboard including totals and shipment breakdown.
          </div>
        )}

        <button onClick={doExport} style={{width:"100%",background:"linear-gradient(135deg,#1e3a5f,#16a34a)",color:"#fff",border:"none",borderRadius:8,padding:"11px 0",cursor:"pointer",fontWeight:700,fontSize:14}}>
          {type==="dashboard" ? "📄 Download PDF" : fmt==="pdf" ? "📄 Download PDF" : "📊 Download CSV"}
        </button>
      </div>
    </div>
  );
}

// ─── Import Modal (fixed for mobile + desktop) ────────────────────────────────
function ImportModal({ onImport, onClose }) {
  const fileRef = useRef();
  const [preview, setPreview] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState("");

  const parseCSV = (text) => {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return [];
    const rows = lines.slice(1).map(line => {
      const cols = [], cur = { v: "", q: false };
      for (const ch of line) {
        if (ch === '"') { cur.q = !cur.q; }
        else if (ch === ',' && !cur.q) { cols.push(cur.v.trim()); cur.v = ""; }
        else cur.v += ch;
      }
      cols.push(cur.v.trim());
      return cols.map(c => c.replace(/^"|"$/g, "").replace(/""/g, '"'));
    }).filter(r => r[0] && r[0].trim());
    return rows.map(r => ({
      invoice_no: r[0]||"", invoice_date: r[1]||null, buyer_name: r[2]||"",
      buyer_country: r[3]||"", product: r[4]||"", port_of_loading: r[5]||"",
      port_of_discharge: r[6]||"", shipping_bill_no: r[7]||"", shipping_bill_date: r[8]||null,
      port_code: r[9]||"", bl_no: r[10]||"", bl_date: r[11]||null,
      qty: r[12]?Number(r[12])||null:null, rate_per_mt: r[13]?Number(r[13])||null:null,
      delivery_terms: r[14]||"CIF", exchange_rate: r[15]?Number(r[15])||null:null,
      igst: r[16]?Number(r[16])||0:0, fob_value_usd: r[17]?Number(r[17])||null:null,
      rodtep_amount: r[18]?Number(r[18])||null:null,
      rodtep_status: r[19]||"Pending", gst_status: r[20]||"Pending",
      remarks: r[21]||"", bc_id: null
    }));
  };

  const handleFile = (file) => {
    if (!file) return;
    setError("");
    if (!file.name.match(/\.(csv|txt)$/i)) {
      setError("Please select a CSV file (.csv or .txt)");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = parseCSV(ev.target.result);
        if (data.length === 0) { setError("No valid data rows found. Please check your CSV file."); return; }
        setParsed(data);
        setPreview(data.slice(0, 3));
      } catch (e) {
        setError("Error reading file: " + e.message);
      }
    };
    reader.onerror = () => setError("Failed to read file. Please try again.");
    reader.readAsText(file, "UTF-8");
  };

  const handleInputChange = (e) => {
    const file = e.target.files[0];
    if (file) handleFile(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,padding:12}}>
      <div style={{background:"#fff",borderRadius:14,padding:20,width:"100%",maxWidth:560,maxHeight:"93vh",overflow:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <h3 style={{margin:0,color:"#1e3a5f",fontSize:15}}>Import Shipment Data</h3>
          <button onClick={onClose} style={{background:"#f1f5f9",border:"none",borderRadius:6,padding:"5px 12px",cursor:"pointer",fontWeight:600}}>✕</button>
        </div>

        {/* Step 1 */}
        <div style={{background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:10,padding:12,marginBottom:12}}>
          <p style={{margin:"0 0 6px",fontSize:13,fontWeight:600,color:"#1d4ed8"}}>Step 1: Download Template</p>
          <p style={{margin:"0 0 8px",fontSize:11.5,color:"#1e40af"}}>Fill in your data in this format and save as CSV.</p>
          <button onClick={()=>dlCSV("Devratan_Import_Template.csv",toCSV(
            ["Invoice No","Invoice Date (YYYY-MM-DD)","Buyer Name","Buyer Country","Product","Port of Loading","Port of Discharge","Shipping Bill No","Shipping Bill Date","Port Code","BL No","BL Date","Qty (MT)","Rate Per MT (USD)","Delivery Terms","Exchange Rate","IGST (INR)","FOB Value (USD)","RODTEP Amount (INR)","RODTEP Status","GST Status","Remarks"],
            [["INV-2627-001","2026-04-10","Sample Buyer","UAE","Basmati Rice 1121","Mundra","Dubai","SB000001","2026-04-08","INMUN1","BL000001","2026-04-12","25","900","CIF","84.5","0","21000","18000","Pending","Pending",""]]
          ))} style={{background:"#1d4ed8",color:"#fff",border:"none",borderRadius:7,padding:"7px 14px",cursor:"pointer",fontWeight:600,fontSize:12}}>
            ⬇️ Download Template (CSV)
          </button>
        </div>

        {/* Step 2 */}
        <div style={{background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:10,padding:12,marginBottom:12}}>
          <p style={{margin:"0 0 8px",fontSize:13,fontWeight:600,color:"#15803d"}}>Step 2: Select Your CSV File</p>

          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={e=>e.preventDefault()}
            onClick={()=>fileRef.current?.click()}
            style={{border:"2px dashed #86efac",borderRadius:8,padding:"20px 10px",textAlign:"center",cursor:"pointer",background:"#f0fdf4",marginBottom:8}}
          >
            <div style={{fontSize:28,marginBottom:4}}>📂</div>
            <div style={{fontSize:13,fontWeight:600,color:"#15803d"}}>Tap to select CSV file</div>
            <div style={{fontSize:11,color:"#64748b",marginTop:2}}>or drag & drop here</div>
          </div>

          {/* Hidden file input — key trick for mobile compatibility */}
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv,text/plain,.txt"
            onChange={handleInputChange}
            style={{display:"none"}}
          />

          {/* Visible button as fallback for some mobile browsers */}
          <button
            onClick={()=>fileRef.current?.click()}
            style={{width:"100%",background:"#16a34a",color:"#fff",border:"none",borderRadius:7,padding:"9px 0",cursor:"pointer",fontWeight:600,fontSize:13}}
          >
            📎 Browse / Select File
          </button>
        </div>

        {/* Error */}
        {error && <div style={{background:"#fee2e2",color:"#dc2626",borderRadius:8,padding:"10px 14px",fontSize:12,marginBottom:10}}>{error}</div>}

        {/* Preview */}
        {preview && parsed && (
          <div style={{background:"#f8fafc",borderRadius:10,padding:12,marginBottom:12,border:"1px solid #e2e8f0"}}>
            <div style={{fontSize:12,fontWeight:600,color:"#15803d",marginBottom:6}}>
              ✅ {parsed.length} row(s) ready to import
            </div>
            <div style={{fontSize:11,color:"#64748b",marginBottom:6}}>Preview (first 3 rows):</div>
            <div style={{overflowX:"auto"}}>
              {preview.map((r,i)=>(
                <div key={i} style={{background:"#fff",borderRadius:6,padding:"6px 10px",marginBottom:4,fontSize:11,border:"1px solid #e2e8f0"}}>
                  <b style={{color:"#1e3a5f"}}>{r.invoice_no}</b> · {r.buyer_name} · {r.buyer_country} · {r.invoice_date} · Qty: {r.qty}
                </div>
              ))}
            </div>
            <button
              onClick={()=>onImport(parsed)}
              style={{width:"100%",marginTop:10,background:"linear-gradient(135deg,#15803d,#16a34a)",color:"#fff",border:"none",borderRadius:8,padding:"10px 0",cursor:"pointer",fontWeight:700,fontSize:14}}
            >
              ⬆️ Import {parsed.length} Shipment(s)
            </button>
          </div>
        )}

        <button onClick={onClose} style={{background:"#f1f5f9",color:"#64748b",border:"none",borderRadius:8,padding:"8px 16px",cursor:"pointer",fontWeight:600,fontSize:13,width:"100%"}}>Close</button>
      </div>
    </div>
  );
}

function Badge({val,map}){ const m=map||bMap,c=m[val]||{bg:"#f1f5f9",color:"#64748b"}; return <span style={{background:c.bg,color:c.color,borderRadius:20,padding:"3px 10px",fontSize:11,fontWeight:600,whiteSpace:"nowrap"}}>{val||"—"}</span>; }
function Row({l,v,bold,col}){ return <div style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:"1px solid #f8fafc",fontSize:12.5}}><span style={{color:"#64748b"}}>{l}</span><span style={{fontWeight:bold?700:600,color:col||"#1e293b"}}>{v}</span></div>; }
function SH({t,color,bg}){ return <div style={{fontSize:12.5,fontWeight:700,color:color||"#1e3a5f",background:bg||"#f1f5f9",borderRadius:6,padding:"6px 10px",marginBottom:10,marginTop:14}}>{t}</div>; }
function FYBar({selected,onChange,counts}){ return <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}><span style={{fontSize:12,fontWeight:600,color:"#64748b",whiteSpace:"nowrap"}}>FY:</span><div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{ALL_FYS.map(fy=><button key={fy} onClick={()=>onChange(fy)} style={{background:selected===fy?"linear-gradient(135deg,#1e3a5f,#16a34a)":"#f1f5f9",color:selected===fy?"#fff":"#64748b",border:"none",borderRadius:20,padding:"4px 11px",cursor:"pointer",fontWeight:selected===fy?700:500,fontSize:11.5,boxShadow:selected===fy?"0 2px 8px rgba(30,58,95,0.25)":"none"}}>FY {fy}{counts[fy]>0?` (${counts[fy]})`:"" }</button>)}</div></div>; }
function Logo({size}){ return <img src="https://raw.githubusercontent.com/mittal94/devratan-exports/refs/heads/main/Devratan%20Enterprises%20Logo_2_Devratan%20Enterprises%20Logo_2.svg" alt="Logo" width={size||36} height={size||36} style={{objectFit:"contain"}}/>; }

function ShareModal({text,onClose}){
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:12}}>
      <div style={{background:"#fff",borderRadius:14,padding:24,width:"100%",maxWidth:500,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}><h3 style={{margin:0,color:"#1e3a5f"}}>Share Summary</h3><button onClick={onClose} style={{background:"#f1f5f9",border:"none",borderRadius:6,padding:"5px 12px",cursor:"pointer",fontWeight:600}}>X</button></div>
        <textarea readOnly value={text} onClick={e=>e.target.select()} style={{...iS,height:180,resize:"none",fontFamily:"monospace",fontSize:12}}/>
        <p style={{fontSize:11,color:"#94a3b8",margin:"4px 0 12px"}}>Click text to select, then copy.</p>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
          <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer" style={{display:"block",background:"#25d366",color:"#fff",borderRadius:8,padding:"10px 0",textAlign:"center",fontWeight:700,fontSize:13,textDecoration:"none"}}>WhatsApp</a>
          <a href={`mailto:?subject=Shipment Summary&body=${encodeURIComponent(text)}`} style={{display:"block",background:"#1e3a5f",color:"#fff",borderRadius:8,padding:"10px 0",textAlign:"center",fontWeight:700,fontSize:13,textDecoration:"none"}}>Email</a>
        </div>
        <button onClick={()=>{navigator.clipboard&&navigator.clipboard.writeText(text);alert("Copied!");}} style={{width:"100%",background:"#f1f5f9",color:"#374151",border:"none",borderRadius:8,padding:"9px 0",cursor:"pointer",fontWeight:600,fontSize:13}}>Copy to Clipboard</button>
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
      if(editId){ await sb(`users?id=eq.${editId}`,{method:"PATCH",body:JSON.stringify({name:form.name,role:form.role})}); setMsg("User updated!"); }
      else{ await authFetch("/auth/v1/admin/users",{method:"POST",body:JSON.stringify({email:form.email,password:form.password||"Devratan@2526",email_confirm:true})}); await sb("users",{method:"POST",body:JSON.stringify({name:form.name,email:form.email,role:form.role})}); setMsg("User created! Password: "+(form.password||"Devratan@2526")); }
      setForm({name:"",email:"",role:"viewer",password:""});setEditId(null);onRefresh();
    }catch(e){setMsg("Error: "+e.message);}
    setLoading(false);
  };
  const delUser=async(id,email)=>{ if(!window.confirm(`Delete ${email}?`))return; setLoading(true); try{await sb(`users?id=eq.${id}`,{method:"DELETE"});setMsg("Deleted.");onRefresh();}catch(e){setMsg("Error: "+e.message);} setLoading(false); };
  const startEdit=u=>{setEditId(u.id);setForm({name:u.name,email:u.email,role:u.role,password:""});};
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:12}}>
      <div style={{background:"#fff",borderRadius:14,padding:24,width:"100%",maxWidth:680,maxHeight:"93vh",overflow:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><h3 style={{margin:0,color:"#1e3a5f"}}>User Management</h3><button onClick={onClose} style={{background:"#f1f5f9",border:"none",borderRadius:6,padding:"5px 12px",cursor:"pointer",fontWeight:600}}>X</button></div>
        <SH t="Current Users"/>
        {users.map(u=><div key={u.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",background:"#f8fafc",borderRadius:8,marginBottom:8}}>
          <div><div style={{fontWeight:600,color:"#1e293b",fontSize:13}}>{u.name}</div><div style={{fontSize:12,color:"#64748b"}}>{u.email}</div></div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}><Badge val={u.role}/><button onClick={()=>startEdit(u)} style={{background:"#dbeafe",color:"#1d4ed8",border:"none",borderRadius:5,padding:"3px 10px",cursor:"pointer",fontSize:12}}>Edit</button><button onClick={()=>delUser(u.id,u.email)} style={{background:"#fee2e2",color:"#dc2626",border:"none",borderRadius:5,padding:"3px 10px",cursor:"pointer",fontSize:12}}>Delete</button></div>
        </div>)}
        <SH t={editId?"Edit User":"Add New User"}/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
          {[["name","Full Name","text"],["email","Email","email"],["password","Password","password"]].map(([k,l,t])=><div key={k}><label style={{fontSize:11.5,fontWeight:600,color:"#374151",display:"block",marginBottom:3}}>{l}</label><input type={t} value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} style={iS} disabled={!!(editId&&k==="email")}/></div>)}
          <div><label style={{fontSize:11.5,fontWeight:600,color:"#374151",display:"block",marginBottom:3}}>Role</label><select value={form.role} onChange={e=>setForm(f=>({...f,role:e.target.value}))} style={iS}><option value="admin">Admin</option><option value="senior_accountant">Senior Accountant</option><option value="junior_accountant">Junior Accountant</option><option value="accountant">Accountant</option><option value="viewer">Viewer</option></select></div>
        </div>
        {msg&&<div style={{background:msg.includes("Error")?"#fee2e2":"#dcfce7",color:msg.includes("Error")?"#dc2626":"#16a34a",borderRadius:8,padding:"10px 14px",fontSize:13,marginBottom:12}}>{msg}</div>}
        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
          {editId&&<button onClick={()=>{setEditId(null);setForm({name:"",email:"",role:"viewer",password:""});}} style={{background:"#f1f5f9",color:"#64748b",border:"none",borderRadius:8,padding:"8px 16px",cursor:"pointer",fontWeight:600}}>Cancel</button>}
          <button onClick={saveUser} disabled={loading} style={{background:"linear-gradient(135deg,#1e3a5f,#16a34a)",color:"#fff",border:"none",borderRadius:8,padding:"8px 22px",cursor:"pointer",fontWeight:700}}>{loading?"Saving...":editId?"Update":"Add User"}</button>
        </div>
      </div>
    </div>
  );
}

function ChangePwdModal({onClose}){
  const [form,setForm]=useState({newPass:"",confirm:""});
  const [msg,setMsg]=useState("");
  const [loading,setLoading]=useState(false);
  const save=async()=>{
    if(form.newPass.length<8){setMsg("Min 8 characters.");return;}
    if(form.newPass!==form.confirm){setMsg("Passwords do not match.");return;}
    setLoading(true);
    try{ await authFetch("/auth/v1/user",{method:"PUT",body:JSON.stringify({password:form.newPass})}); setMsg("Password changed!"); setTimeout(onClose,2000); }
    catch(e){setMsg("Error: "+e.message);}
    setLoading(false);
  };
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:12}}>
      <div style={{background:"#fff",borderRadius:14,padding:24,width:"100%",maxWidth:420,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><h3 style={{margin:0,color:"#1e3a5f"}}>Change Password</h3><button onClick={onClose} style={{background:"#f1f5f9",border:"none",borderRadius:6,padding:"5px 12px",cursor:"pointer",fontWeight:600}}>X</button></div>
        {[["newPass","New Password","password"],["confirm","Confirm Password","password"]].map(([k,l,t])=><div key={k} style={{marginBottom:12}}><label style={{fontSize:11.5,fontWeight:600,color:"#374151",display:"block",marginBottom:3}}>{l}</label><input type={t} value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} style={iS}/></div>)}
        {msg&&<div style={{background:msg.includes("Error")?"#fee2e2":"#dcfce7",color:msg.includes("Error")?"#dc2626":"#16a34a",borderRadius:8,padding:"10px 14px",fontSize:13,marginBottom:12}}>{msg}</div>}
        <button onClick={save} disabled={loading} style={{width:"100%",background:"linear-gradient(135deg,#1e3a5f,#16a34a)",color:"#fff",border:"none",borderRadius:8,padding:"10px 0",cursor:"pointer",fontWeight:700}}>{loading?"Saving...":"Change Password"}</button>
      </div>
    </div>
  );
}

function BCModal({bc, allShips, allBCs, allIRMs, allBRCs, onSave, onClose, saving}){
  // ── Helpers ──────────────────────────────────────────────────────────────────
  const mkInvAlloc = () => ({ id:Date.now()+Math.random(), invoiceNo:"", invoiceAmt:0 });
  const mkBrcAlloc = () => ({ id:Date.now()+Math.random(), brcNo:"",     brcAmt:0   });

  // Pre-compute which invoices / BRCs are already taken by OTHER BCs
  const takenInvoices = new Set(
    allBCs.filter(b=>b.id!==bc?.id)
          .flatMap(b=>b.linked_invoices||[])
  );
  const takenBRCs = new Set(
    allBCs.filter(b=>b.id!==bc?.id)
          .flatMap(b=>b.linked_brcs||[])
  );

  const initInvAllocs = bc?.linked_invoices?.length
    ? bc.linked_invoices.map(inv=>{
        const s=allShips.find(x=>x.invoice_no===inv);
        return { id:Date.now()+Math.random(), invoiceNo:inv, invoiceAmt:s?n(s.qty)*n(s.rate_per_mt):0 };
      })
    : [mkInvAlloc()];

  const initBrcAllocs = bc?.linked_brcs?.length
    ? bc.linked_brcs.map(bno=>{
        const b=allBRCs.find(x=>x.brc_no===bno);
        return { id:Date.now()+Math.random(), brcNo:bno, brcAmt:b?n(b.brc_amt_usd):0 };
      })
    : [mkBrcAlloc()];

  const [form,setForm]=useState({
    id:         bc?.id||null,
    bank_name:  bc?.bank_name||"SBI",
    bc_no:      bc?.bc_no||"",
    bc_date:    bc?.bc_date||"",
    bc_amount_usd: bc?.bc_amount_usd||"",
    invAllocs:  initInvAllocs,
    brcAllocs:  initBrcAllocs,
  });
  const sf=(k,v)=>setForm(f=>({...f,[k]:v}));

  // Invoice alloc helpers
  const updInv=(id,k,v)=>setForm(f=>({...f,invAllocs:f.invAllocs.map(a=>{
    if(a.id!==id) return a;
    const u={...a,[k]:v};
    if(k==="invoiceNo"){
      const s=allShips.find(x=>x.invoice_no===v);
      u.invoiceAmt=s?n(s.qty)*n(s.rate_per_mt):0;
    }
    return u;
  })}));
  const addInv=()=>setForm(f=>({...f,invAllocs:[...f.invAllocs,mkInvAlloc()]}));
  const remInv=(id)=>setForm(f=>({...f,invAllocs:f.invAllocs.filter(a=>a.id!==id)}));

  // BRC alloc helpers
  const updBrc=(id,k,v)=>setForm(f=>({...f,brcAllocs:f.brcAllocs.map(a=>{
    if(a.id!==id) return a;
    const u={...a,[k]:v};
    if(k==="brcNo"){
      const b=allBRCs.find(x=>x.brc_no===v);
      u.brcAmt=b?n(b.brc_amt_usd):0;
    }
    return u;
  })}));
  const addBrc=()=>setForm(f=>({...f,brcAllocs:[...f.brcAllocs,mkBrcAlloc()]}));
  const remBrc=(id)=>setForm(f=>({...f,brcAllocs:f.brcAllocs.filter(a=>a.id!==id)}));

  // Computed totals
  const bcAmt    = n(form.bc_amount_usd)||0;
  const totInv   = form.invAllocs.reduce((s,a)=>s+n(a.invoiceAmt),0);
  const totBrc   = form.brcAllocs.reduce((s,a)=>s+n(a.brcAmt),0);
  const invBal   = bcAmt - totInv;
  const brcBal   = bcAmt - totBrc;

  const save=()=>{
    if(!form.bc_no.trim()){alert("BC No is required.");return;}
    // Duplicate BC No check
    if(allBCs.some(b=>b.id!==form.id && b.bc_no===form.bc_no.trim())){
      alert("BC No "+form.bc_no+" already exists. BC No must be unique.");return;
    }
    if(!form.bc_date){alert("BC Date is required.");return;}
    if(!form.bc_amount_usd){alert("BC Amount (USD) is required.");return;}
    const validInvs=form.invAllocs.filter(a=>a.invoiceNo);
    const validBrcs=form.brcAllocs.filter(a=>a.brcNo);
    onSave({
      ...form,
      linked_invoices: validInvs.map(a=>a.invoiceNo),
      linked_brcs:     validBrcs.map(a=>a.brcNo),
      total_inv_usd:   totInv,
      total_brc_usd:   totBrc,
    });
  };

  const lbl={fontSize:11.5,fontWeight:600,color:"#374151",display:"block",marginBottom:3};
  const secHdr=(icon,title,right)=>(
    <div style={{background:"#1e3a5f",borderRadius:8,padding:"8px 14px",color:"#fff",
                 fontWeight:700,fontSize:13,marginBottom:10,marginTop:14,
                 display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <span>{icon} {title}</span>
      {right&&<span style={{fontSize:11,color:"#93c5fd"}}>{right}</span>}
    </div>
  );

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",display:"flex",
                 alignItems:"center",justifyContent:"center",zIndex:200,padding:12}}>
      <div style={{background:"#fff",borderRadius:14,padding:24,width:"100%",maxWidth:820,
                   maxHeight:"95vh",overflow:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.35)"}}>

        {/* Header */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <h3 style={{margin:0,color:"#1e3a5f",fontSize:17}}>{bc?"Edit":"Create"} Bill Collection</h3>
          <button onClick={onClose} style={{background:"#f1f5f9",border:"none",borderRadius:6,padding:"5px 12px",cursor:"pointer",fontWeight:600}}>✕</button>
        </div>

        {/* ── BC Details ── */}
        {secHdr("📋","BC Details", bcAmt>0?"Total: USD "+fU(bcAmt):"")}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:12,marginBottom:4}}>
          <div><label style={lbl}>Bank *</label>
            <select value={form.bank_name} onChange={e=>sf("bank_name",e.target.value)} style={iS}>
              {BANKS.map(b=><option key={b}>{b}</option>)}
            </select>
          </div>
          <div><label style={lbl}>BC No *</label>
            <input value={form.bc_no} onChange={e=>sf("bc_no",e.target.value)} style={iS} placeholder="e.g. BC-2627-001"/>
          </div>
          <div><label style={lbl}>BC Date *</label>
            <input type="date" value={form.bc_date} onChange={e=>sf("bc_date",e.target.value)} style={iS}/>
          </div>
          <div><label style={lbl}>Total BC Amount (USD) *</label>
            <input type="number" step="any" value={form.bc_amount_usd}
                   onChange={e=>sf("bc_amount_usd",e.target.value)} style={iS} placeholder="0.00"/>
          </div>
        </div>

        {/* ── Invoice Allocation ── */}
        {secHdr("🔗","Invoice Allocation",
          bcAmt>0 ? (invBal<-0.01?"⚠️ Over by USD "+fU(Math.abs(invBal))
                    :invBal<0.01?"✅ Fully Allocated"
                    :"Balance: USD "+fU(invBal)) : ""
        )}
        {form.invAllocs.map((a,idx)=>{
          const usedByOtherAlloc = form.invAllocs.filter((_,i)=>i!==idx).map(x=>x.invoiceNo);
          const availShips = allShips.filter(s=>
            !takenInvoices.has(s.invoice_no) &&
            !usedByOtherAlloc.includes(s.invoice_no)
          );
          return(
            <div key={a.id} style={{display:"grid",gridTemplateColumns:"1fr 1fr auto",
                                    gap:10,marginBottom:8,alignItems:"flex-end"}}>
              <div>
                <label style={lbl}>Invoice No {idx===0?"*":""}</label>
                <select value={a.invoiceNo} onChange={e=>updInv(a.id,"invoiceNo",e.target.value)} style={iS}>
                  <option value="">-- Select Invoice --</option>
                  {availShips.map(s=>{
                    const amt=n(s.qty)*n(s.rate_per_mt);
                    return <option key={s.id} value={s.invoice_no}>{s.invoice_no} — USD {fU(amt)}</option>;
                  })}
                  {/* Always show current selection even if taken */}
                  {a.invoiceNo&&!availShips.find(x=>x.invoice_no===a.invoiceNo)&&(
                    <option value={a.invoiceNo}>{a.invoiceNo} (current)</option>
                  )}
                </select>
              </div>
              <div>
                <label style={{...lbl,color:"#0369a1"}}>Invoice Amount (USD) — Auto</label>
                <input readOnly value={a.invoiceAmt>0?fU(a.invoiceAmt):"—"} style={cS}/>
              </div>
              <div style={{paddingBottom:2}}>
                {form.invAllocs.length>1
                  ? <button onClick={()=>remInv(a.id)} style={{background:"#fee2e2",color:"#dc2626",border:"none",borderRadius:6,padding:"7px 10px",cursor:"pointer"}}>✕</button>
                  : <div style={{width:34}}/>}
              </div>
            </div>
          );
        })}
        {(bcAmt<=0||invBal>0.01)&&<button onClick={addInv}
          style={{background:"#eff6ff",color:"#1d4ed8",border:"1px solid #bfdbfe",
                  borderRadius:6,padding:"5px 14px",cursor:"pointer",fontSize:12,fontWeight:600,marginBottom:4}}>
          + Add Invoice
        </button>}
        {bcAmt>0&&invBal<=0.01&&<div style={{fontSize:11,color:"#16a34a",fontWeight:600,marginBottom:4}}>
          ✅ Invoices fully cover BC amount
        </div>}

        {/* ── BRC Allocation ── */}
        {secHdr("✅","BRC Allocation",
          bcAmt>0 ? (brcBal<-0.01?"⚠️ Over by USD "+fU(Math.abs(brcBal))
                    :brcBal<0.01?"✅ Fully Allocated"
                    :"Balance: USD "+fU(brcBal)) : ""
        )}
        {form.brcAllocs.map((a,idx)=>{
          const usedByOtherAlloc = form.brcAllocs.filter((_,i)=>i!==idx).map(x=>x.brcNo);
          const availBRCs = allBRCs.filter(b=>
            b.brc_no &&
            !takenBRCs.has(b.brc_no) &&
            !usedByOtherAlloc.includes(b.brc_no)
          );
          // Find full BRC detail for summary
          const brcDetail = allBRCs.find(b=>b.brc_no===a.brcNo);
          return(
            <div key={a.id} style={{marginBottom:10}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr auto",gap:10,alignItems:"flex-end"}}>
                <div>
                  <label style={lbl}>BRC No {idx===0?"*":""}</label>
                  <select value={a.brcNo} onChange={e=>updBrc(a.id,"brcNo",e.target.value)} style={iS}>
                    <option value="">-- Select BRC --</option>
                    {availBRCs.map(b=>(
                      <option key={b.id} value={b.brc_no}>{b.brc_no} — USD {fU(n(b.brc_amt_usd))}</option>
                    ))}
                    {a.brcNo&&!availBRCs.find(x=>x.brc_no===a.brcNo)&&(
                      <option value={a.brcNo}>{a.brcNo} (current)</option>
                    )}
                  </select>
                </div>
                <div>
                  <label style={{...lbl,color:"#0369a1"}}>BRC Amount (USD) — Auto</label>
                  <input readOnly value={a.brcAmt>0?fU(a.brcAmt):"—"} style={cS}/>
                </div>
                <div style={{paddingBottom:2}}>
                  {form.brcAllocs.length>1
                    ? <button onClick={()=>remBrc(a.id)} style={{background:"#fee2e2",color:"#dc2626",border:"none",borderRadius:6,padding:"7px 10px",cursor:"pointer"}}>✕</button>
                    : <div style={{width:34}}/>}
                </div>
              </div>
              {/* BRC summary chip */}
              {brcDetail&&(
                <div style={{background:"#eff6ff",borderRadius:6,padding:"5px 10px",
                             marginTop:4,fontSize:11,color:"#1d4ed8",display:"flex",gap:12,flexWrap:"wrap"}}>
                  {brcDetail.linked_invoice_no&&<span>📄 Invoice: <strong>{brcDetail.linked_invoice_no}</strong></span>}
                  {brcDetail.linked_irm_id&&<span>📥 IRM: <strong>{allIRMs.find(i=>String(i.id)===String(brcDetail.linked_irm_id))?.irm_no||brcDetail.linked_irm_id}</strong></span>}
                  <span>💰 USD {fU(n(brcDetail.brc_amt_usd))}</span>
                </div>
              )}
            </div>
          );
        })}
        {(bcAmt<=0||brcBal>0.01)&&<button onClick={addBrc}
          style={{background:"#eff6ff",color:"#1d4ed8",border:"1px solid #bfdbfe",
                  borderRadius:6,padding:"5px 14px",cursor:"pointer",fontSize:12,fontWeight:600}}>
          + Add BRC
        </button>}
        {bcAmt>0&&brcBal<=0.01&&<div style={{fontSize:11,color:"#16a34a",fontWeight:600}}>
          ✅ BRCs fully cover BC amount
        </div>}

        {/* ── Summary bar ── */}
        <div style={{background:"#1e3a5f",borderRadius:10,padding:14,marginTop:16,
                     display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:12}}>
          <div><div style={{fontSize:10,color:"#94a3b8",marginBottom:2}}>BC Amount (USD)</div>
               <div style={{fontSize:16,fontWeight:700,color:"#fde68a"}}>{bcAmt>0?fU(bcAmt):"—"}</div></div>
          <div><div style={{fontSize:10,color:"#94a3b8",marginBottom:2}}>Invoices Linked</div>
               <div style={{fontSize:16,fontWeight:700,color:"#fff"}}>{form.invAllocs.filter(a=>a.invoiceNo).length} · USD {fU(totInv)}</div></div>
          <div><div style={{fontSize:10,color:"#94a3b8",marginBottom:2}}>BRCs Linked</div>
               <div style={{fontSize:16,fontWeight:700,color:"#7dd3fc"}}>{form.brcAllocs.filter(a=>a.brcNo).length} · USD {fU(totBrc)}</div></div>
          <div><div style={{fontSize:10,color:"#94a3b8",marginBottom:2}}>Inv Balance</div>
               <div style={{fontSize:16,fontWeight:700,color:invBal<-0.01?"#fca5a5":invBal<0.01?"#86efac":"#fff"}}>{fU(invBal)}</div></div>
        </div>

        {/* ── Actions ── */}
        <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:20}}>
          <button onClick={onClose} style={{background:"#f1f5f9",color:"#64748b",border:"none",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontWeight:600}}>Cancel</button>
          <button onClick={save} disabled={saving}
            style={{background:"linear-gradient(135deg,#1e3a5f,#2563eb)",color:"#fff",border:"none",
                    borderRadius:8,padding:"8px 24px",cursor:"pointer",fontWeight:700,fontSize:13}}>
            {saving?"Saving…":"💾 Save BC"}
          </button>
        </div>
      </div>
    </div>
  );
}


// ─── IRM Modal ─────────────────────────────────────────────────────────────────
function IRMModal({irm, allIRMs, onSave, onClose, saving}){
  const [form,setForm]=useState({
    id:       irm?.id||null,
    irm_no:   irm?.irm_no||"",
    irm_date: irm?.irm_date||"",
    irm_total_usd: irm?.irm_total_usd||irm?.irm_amt_usd||"",
    exchange_rate: irm?.exchange_rate||"",
    irm_amt_inr:   irm?.irm_amt_inr||0,
    intermediary_charges_usd: irm?.intermediary_charges_usd||"",
  });
  const sf=(k,v)=>setForm(f=>({...f,[k]:v}));

  const autoINR=(irmUSD,exRate)=>setForm(f=>({...f,irm_amt_inr:n(irmUSD)*n(exRate)}));

  const save=()=>{
    if(!form.irm_no.trim()){alert("IRM No is required.");return;}
    if(allIRMs.some(i=>i.id!==form.id && i.irm_no===form.irm_no.trim())){
      alert("IRM No "+form.irm_no+" already exists. IRM No must be unique.");return;
    }
    if(!form.irm_date){alert("IRM Date is required.");return;}
    if(!form.irm_total_usd){alert("Total IRM Amount (USD) is required.");return;}
    if(!form.exchange_rate){alert("Exchange Rate is required.");return;}
    onSave(form);
  };
  const lbl={fontSize:11.5,fontWeight:600,color:"#374151",display:"block",marginBottom:3};

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",display:"flex",
                 alignItems:"center",justifyContent:"center",zIndex:300,padding:12}}>
      <div style={{background:"#fff",borderRadius:14,padding:24,width:"100%",maxWidth:600,
                   boxShadow:"0 20px 60px rgba(0,0,0,0.35)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <h3 style={{margin:0,color:"#1e3a5f",fontSize:17}}>{irm?"Edit":"Create"} IRM Entry</h3>
          <button onClick={onClose} style={{background:"#f1f5f9",border:"none",borderRadius:6,padding:"5px 12px",cursor:"pointer",fontWeight:600}}>✕</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <div><label style={lbl}>IRM No *</label>
            <input value={form.irm_no} onChange={e=>sf("irm_no",e.target.value)} style={iS} placeholder="e.g. IRM-001"/>
          </div>
          <div><label style={lbl}>IRM Date *</label>
            <input type="date" value={form.irm_date} onChange={e=>sf("irm_date",e.target.value)} style={iS}/>
          </div>
          <div><label style={lbl}>Total IRM Amount (USD) *</label>
            <input type="number" step="any" value={form.irm_total_usd}
                   onChange={e=>{sf("irm_total_usd",e.target.value);autoINR(e.target.value,form.exchange_rate);}}
                   style={iS} placeholder="0.00"/>
          </div>
          <div><label style={lbl}>Exchange Rate *</label>
            <input type="number" step="any" value={form.exchange_rate}
                   onChange={e=>{sf("exchange_rate",e.target.value);autoINR(form.irm_total_usd,e.target.value);}}
                   style={iS} placeholder="e.g. 84.50"/>
          </div>
          <div><label style={lbl}>Intermediary Bank Charges (USD)</label>
            <input type="number" step="any" value={form.intermediary_charges_usd}
                   onChange={e=>sf("intermediary_charges_usd",e.target.value)} style={iS} placeholder="0.00"/>
          </div>
          <div><label style={{...lbl,color:"#0369a1"}}>IRM Amount (INR) — Auto</label>
            <input readOnly value={fR(form.irm_amt_inr||0)} style={cS}/>
          </div>
        </div>
        {/* Summary chip */}
        {n(form.irm_total_usd)>0&&(
          <div style={{background:"#eff6ff",borderRadius:8,padding:"8px 12px",marginTop:14,
                       fontSize:12,color:"#1d4ed8",display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
            <div><div style={{fontSize:10,color:"#64748b"}}>Total IRM</div>
                 <div style={{fontWeight:700}}>USD {fU(n(form.irm_total_usd))}</div></div>
            <div><div style={{fontSize:10,color:"#64748b"}}>Charges</div>
                 <div style={{fontWeight:700}}>USD {fU(n(form.intermediary_charges_usd))}</div></div>
            <div><div style={{fontSize:10,color:"#64748b"}}>Net (INR)</div>
                 <div style={{fontWeight:700}}>{fR(form.irm_amt_inr||0)}</div></div>
          </div>
        )}
        <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:20}}>
          <button onClick={onClose} style={{background:"#f1f5f9",color:"#64748b",border:"none",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontWeight:600}}>Cancel</button>
          <button onClick={save} disabled={saving}
            style={{background:"linear-gradient(135deg,#1e3a5f,#2563eb)",color:"#fff",border:"none",
                    borderRadius:8,padding:"8px 24px",cursor:"pointer",fontWeight:700,fontSize:13}}>
            {saving?"Saving…":"💾 Save IRM"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── BRC Modal ─────────────────────────────────────────────────────────────────
function BRCModal({brc, allBRCs, allIRMs, allShips, allBCs, onSave, onClose, saving}){
  const mkIRMAlloc=()=>({id:Date.now()+Math.random(), irmId:"", irmUtilAmt:""});

  // Pre-compute IRM utilised amounts across all OTHER BRCs
  const irmUsedElsewhere=(irmId)=>
    allBRCs.filter(b=>b.id!==brc?.id)
           .flatMap(b=>b.irm_allocations||[])
           .filter(a=>String(a.irmId)===String(irmId))
           .reduce((s,a)=>s+n(a.irmUtilAmt),0);

  // Pre-compute invoice amounts already covered by OTHER BRCs in OTHER BCs
  const invCoveredElsewhere=(invNo)=>
    allBRCs.filter(b=>b.id!==brc?.id && b.linked_invoice_no===invNo)
           .reduce((s,b)=>s+n(b.brc_amt_usd),0);

  const [form,setForm]=useState({
    id:              brc?.id||null,
    brc_no:          brc?.brc_no||"",
    brc_date:        brc?.brc_date||"",
    brc_amt_usd:     brc?.brc_amt_usd||"",
    linked_invoice_no: brc?.linked_invoice_no||"",
    irm_allocations: brc?.irm_allocations?.length
      ? brc.irm_allocations
      : [mkIRMAlloc()],
  });
  const sf=(k,v)=>setForm(f=>({...f,[k]:v}));

  // IRM alloc helpers
  const updIRM=(id,k,v)=>setForm(f=>({...f,irm_allocations:f.irm_allocations.map(a=>a.id!==id?a:{...a,[k]:v})}));
  const addIRM=()=>setForm(f=>({...f,irm_allocations:[...f.irm_allocations,mkIRMAlloc()]}));
  const remIRM=(id)=>setForm(f=>({...f,irm_allocations:f.irm_allocations.filter(a=>a.id!==id)}));

  const brcAmt     = n(form.brc_amt_usd)||0;
  const totIRMUtil = form.irm_allocations.reduce((s,a)=>s+n(a.irmUtilAmt),0);
  const irmBal     = brcAmt - totIRMUtil;

  const save=()=>{
    if(!form.brc_no.trim()){alert("BRC No is required.");return;}
    if(allBRCs.some(b=>b.id!==form.id && b.brc_no===form.brc_no.trim())){
      alert("BRC No "+form.brc_no+" already exists. BRC No must be unique.");return;
    }
    if(!form.brc_date){alert("BRC Date is required.");return;}
    if(!form.brc_amt_usd){alert("BRC Amount (USD) is required.");return;}
    if(!form.linked_invoice_no){alert("Invoice is required.");return;}
    const validIRMs=form.irm_allocations.filter(a=>a.irmId&&a.irmUtilAmt);
    if(!validIRMs.length){alert("At least one IRM allocation is required.");return;}
    const totalUtil=validIRMs.reduce((s,a)=>s+n(a.irmUtilAmt),0);
    if(totalUtil>brcAmt+0.01){
      alert("Total IRM utilisation (USD "+fU(totalUtil)+") cannot exceed BRC amount (USD "+fU(brcAmt)+").");return;
    }
    for(const a of validIRMs){
      const irmObj=allIRMs.find(i=>String(i.id)===String(a.irmId));
      if(irmObj){
        const available=n(irmObj.irm_total_usd||irmObj.irm_amt_usd)-irmUsedElsewhere(a.irmId);
        if(n(a.irmUtilAmt)>available+0.01){
          alert("IRM "+irmObj.irm_no+": amount to utilise (USD "+fU(n(a.irmUtilAmt))+") exceeds available balance (USD "+fU(available)+").");return;
        }
      }
    }
    onSave({...form, irm_allocations:validIRMs});
  };
  const lbl={fontSize:11.5,fontWeight:600,color:"#374151",display:"block",marginBottom:3};
  const secHdr=(icon,title,right)=>(
    <div style={{background:"#1e3a5f",borderRadius:8,padding:"8px 14px",color:"#fff",
                 fontWeight:700,fontSize:13,marginBottom:10,marginTop:14,
                 display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <span>{icon} {title}</span>
      {right&&<span style={{fontSize:11,color:"#93c5fd"}}>{right}</span>}
    </div>
  );

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",display:"flex",
                 alignItems:"center",justifyContent:"center",zIndex:300,padding:12}}>
      <div style={{background:"#fff",borderRadius:14,padding:24,width:"100%",maxWidth:740,
                   maxHeight:"95vh",overflow:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.35)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <h3 style={{margin:0,color:"#1e3a5f",fontSize:17}}>{brc?"Edit":"Create"} BRC Entry</h3>
          <button onClick={onClose} style={{background:"#f1f5f9",border:"none",borderRadius:6,padding:"5px 12px",cursor:"pointer",fontWeight:600}}>✕</button>
        </div>

        {/* ── BRC Core ── */}
        {secHdr("✅","BRC Details",brcAmt>0?"Total: USD "+fU(brcAmt):"")}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:4}}>
          <div><label style={lbl}>BRC No *</label>
            <input value={form.brc_no} onChange={e=>sf("brc_no",e.target.value)} style={iS} placeholder="e.g. BRC-001"/>
          </div>
          <div><label style={lbl}>BRC Date *</label>
            <input type="date" value={form.brc_date} onChange={e=>sf("brc_date",e.target.value)} style={iS}/>
          </div>
          <div><label style={lbl}>BRC Amount (USD) *</label>
            <input type="number" step="any" value={form.brc_amt_usd}
                   onChange={e=>sf("brc_amt_usd",e.target.value)} style={iS} placeholder="0.00"/>
          </div>
        </div>

        {/* ── IRM Allocation ── */}
        {secHdr("📥","IRM Allocation",
          brcAmt>0?(irmBal<-0.01?"⚠️ Over by USD "+fU(Math.abs(irmBal))
                   :irmBal<0.01?"✅ Fully Allocated"
                   :"Remaining: USD "+fU(irmBal)):""
        )}
        {form.irm_allocations.map((a,idx)=>{
          const irmObj    = allIRMs.find(i=>String(i.id)===String(a.irmId));
          const irmTotal  = irmObj?n(irmObj.irm_total_usd||irmObj.irm_amt_usd):0;
          const usedElse  = irmObj?irmUsedElsewhere(a.irmId):0;
          const usedHere  = form.irm_allocations.filter((_,i)=>i!==idx).reduce((s,x)=>String(x.irmId)===String(a.irmId)?s+n(x.irmUtilAmt):s,0);
          const available = irmTotal - usedElse - usedHere;
          // Filter out fully utilised IRMs (allow current selection)
          const availIRMs = allIRMs.filter(i=>{
            const tot=n(i.irm_total_usd||i.irm_amt_usd);
            const used=irmUsedElsewhere(i.id);
            return (tot-used)>0.01 || String(i.id)===String(a.irmId);
          });
          return(
            <div key={a.id} style={{background:"#f8fafc",borderRadius:8,padding:10,marginBottom:8,border:"1px solid #e2e8f0"}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr auto",gap:10,alignItems:"flex-end"}}>
                <div>
                  <label style={lbl}>IRM No *</label>
                  <select value={String(a.irmId||"")} onChange={e=>updIRM(a.id,"irmId",e.target.value)} style={iS}>
                    <option value="">-- Select IRM --</option>
                    {availIRMs.map(i=>{
                      const tot=n(i.irm_total_usd||i.irm_amt_usd);
                      const used=irmUsedElsewhere(i.id);
                      return <option key={i.id} value={String(i.id)}>{i.irm_no} — Bal: USD {fU(tot-used)}</option>;
                    })}
                  </select>
                  {irmObj&&<div style={{fontSize:10,color:"#0369a1",marginTop:2}}>
                    Total: USD {fU(irmTotal)} · Used elsewhere: USD {fU(usedElse)} · Available: USD {fU(available)}
                  </div>}
                </div>
                <div>
                  <label style={lbl}>Amount to Utilise (USD) *</label>
                  <input type="number" step="any" value={a.irmUtilAmt||""}
                         onChange={e=>updIRM(a.id,"irmUtilAmt",e.target.value)}
                         style={iS} placeholder="0.00"/>
                  {n(a.irmUtilAmt)>available+0.01&&<div style={{fontSize:10,color:"#dc2626",marginTop:2}}>⚠️ Exceeds available balance</div>}
                </div>
                <div style={{paddingBottom:2}}>
                  {form.irm_allocations.length>1
                    ? <button onClick={()=>remIRM(a.id)} style={{background:"#fee2e2",color:"#dc2626",border:"none",borderRadius:6,padding:"7px 10px",cursor:"pointer"}}>✕</button>
                    : <div style={{width:34}}/>}
                </div>
              </div>
            </div>
          );
        })}
        {irmBal>0.01&&<button onClick={addIRM}
          style={{background:"#eff6ff",color:"#1d4ed8",border:"1px solid #bfdbfe",
                  borderRadius:6,padding:"5px 14px",cursor:"pointer",fontSize:12,fontWeight:600,marginBottom:4}}>
          + Add IRM
        </button>}
        {brcAmt>0&&irmBal<=0.01&&<div style={{fontSize:11,color:"#16a34a",fontWeight:600,marginBottom:4}}>
          ✅ IRM fully covers BRC amount
        </div>}

        {/* ── Invoice Allocation ── */}
        {secHdr("📄","Invoice Allocation","One invoice per BRC")}
        {(()=>{
          const invAmt=(invNo)=>{
            const s=allShips.find(x=>x.invoice_no===invNo);
            return s?n(s.qty)*n(s.rate_per_mt):0;
          };
          const coveredElse=form.linked_invoice_no?invCoveredElsewhere(form.linked_invoice_no):0;
          const invTotal=invAmt(form.linked_invoice_no);
          const remaining=invTotal-coveredElse-brcAmt;
          // Available invoices: not fully covered
          const availInvs=allShips.filter(s=>{
            const tot=n(s.qty)*n(s.rate_per_mt);
            const cov=invCoveredElsewhere(s.invoice_no);
            return (tot-cov)>0.01 || s.invoice_no===form.linked_invoice_no;
          });
          return(
            <>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:8}}>
                <div>
                  <label style={lbl}>Invoice No *</label>
                  <select value={form.linked_invoice_no}
                          onChange={e=>sf("linked_invoice_no",e.target.value)} style={iS}>
                    <option value="">-- Select Invoice --</option>
                    {availInvs.map(s=>{
                      const tot=n(s.qty)*n(s.rate_per_mt);
                      const cov=invCoveredElsewhere(s.invoice_no);
                      return <option key={s.id} value={s.invoice_no}>
                        {s.invoice_no} — USD {fU(tot)} (Bal: {fU(tot-cov)})
                      </option>;
                    })}
                  </select>
                </div>
                <div>
                  <label style={{...lbl,color:"#0369a1"}}>Invoice Amount (USD)</label>
                  <input readOnly value={form.linked_invoice_no?fU(invAmt(form.linked_invoice_no)):"—"} style={cS}/>
                </div>
              </div>
              {form.linked_invoice_no&&invTotal>0&&(
                <div style={{background:remaining<-0.01?"#fee2e2":remaining<0.01?"#dcfce7":"#eff6ff",
                             borderRadius:6,padding:"5px 10px",fontSize:11,fontWeight:600,
                             color:remaining<-0.01?"#dc2626":remaining<0.01?"#16a34a":"#1d4ed8"}}>
                  Invoice: USD {fU(invTotal)} · Covered by other BRCs: USD {fU(coveredElse)} · This BRC: USD {fU(brcAmt)} · Remaining: USD {fU(remaining)}
                </div>
              )}
            </>
          );
        })()}

        {/* ── Summary ── */}
        <div style={{background:"#1e3a5f",borderRadius:10,padding:12,marginTop:16,
                     display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
          <div><div style={{fontSize:10,color:"#94a3b8",marginBottom:2}}>BRC Amount</div>
               <div style={{fontSize:15,fontWeight:700,color:"#fde68a"}}>{brcAmt>0?fU(brcAmt):"—"}</div></div>
          <div><div style={{fontSize:10,color:"#94a3b8",marginBottom:2}}>IRM Allocated</div>
               <div style={{fontSize:15,fontWeight:700,color:"#fff"}}>{fU(totIRMUtil)}</div></div>
          <div><div style={{fontSize:10,color:"#94a3b8",marginBottom:2}}>BRC Unallocated</div>
               <div style={{fontSize:15,fontWeight:700,color:irmBal<-0.01?"#fca5a5":irmBal<0.01?"#86efac":"#7dd3fc"}}>{fU(irmBal)}</div></div>
        </div>

        <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:20}}>
          <button onClick={onClose} style={{background:"#f1f5f9",color:"#64748b",border:"none",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontWeight:600}}>Cancel</button>
          <button onClick={save} disabled={saving}
            style={{background:"linear-gradient(135deg,#15803d,#16a34a)",color:"#fff",border:"none",
                    borderRadius:8,padding:"8px 24px",cursor:"pointer",fontWeight:700,fontSize:13}}>
            {saving?"Saving…":"💾 Save BRC"}
          </button>
        </div>
      </div>
    </div>
  );
}


// ─── IRM Docs Modal ─────────────────────────────────────────────────────────
function IRMDocsModal({irm, canUpload, canDelete, onClose}){
  const [files,setFiles]=useState({});
  const [loading,setLoading]=useState(true);
  const [uploading,setUploading]=useState({});
  const [deleting,setDeleting]=useState({});
  const fileRefs=useRef({});
  const folder=`irm/${String(irm.irm_no||irm.id||"").trim()}`;
  const docs=[
    {key:"swift_advice",   label:"SWIFT / Bank Advice", accept:".pdf", maxMB:3},
    {key:"irm_copy",       label:"IRM Copy",             accept:".pdf", maxMB:3},
    {key:"bank_statement", label:"Bank Statement",       accept:".pdf", maxMB:5},
    {key:"other",          label:"Other",                accept:".pdf", maxMB:5},
  ];
  const loadFiles=async()=>{
    setLoading(true);
    try{
      const list=await r2List(folder);
      const m={};
      list.forEach(f=>{m[f.docType]=f;});
      setFiles(m);
      console.log("IRM r2List result for",folder,":",list);
    }catch(e){console.error("IRM docs error:",e);}
    setLoading(false);
  };
  useEffect(()=>{loadFiles();},[]);
  const handleUpload=async(key,file,maxMB)=>{
    if(file.size>maxMB*1024*1024){alert("Max "+maxMB+"MB");return;}
    if(!file.name.match(/\.pdf$/i)){alert("PDF only");return;}
    setUploading(u=>({...u,[key]:true}));
    try{
      if(files[key]) await r2Delete(files[key].key);
      await r2Upload(folder,key,file);
      await loadFiles();
    }catch(e){alert("Upload failed: "+e.message); console.error(e);}
    setUploading(u=>({...u,[key]:false}));
  };
  const handleDelete=async(key)=>{
    if(!window.confirm("Delete?"))return;
    setDeleting(d=>({...d,[key]:true}));
    try{await r2Delete(files[key].key);await loadFiles();}
    catch(e){alert("Delete failed: "+e.message);}
    setDeleting(d=>({...d,[key]:false}));
  };
  const fmtSize=b=>b<1024*1024?(b/1024).toFixed(0)+"KB":(b/1024/1024).toFixed(1)+"MB";
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,padding:10}}>
      <div style={{background:"#fff",borderRadius:14,width:"100%",maxWidth:520,maxHeight:"90vh",overflow:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{background:"linear-gradient(135deg,#0369a1,#0284c7)",borderRadius:"14px 14px 0 0",padding:"14px 18px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontWeight:700,color:"#fff",fontSize:15}}>📥 IRM Documents — {irm.irm_no}</div>
            <div style={{fontSize:11,color:"#bae6fd",marginTop:2}}>Date: {irm.irm_date||"—"} · Amount: {fU(irm.irm_total_usd||irm.irm_amt_usd||0)}</div>
          </div>
          <button onClick={onClose} style={{background:"rgba(255,255,255,0.2)",border:"none",color:"#fff",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontWeight:600}}>✕</button>
        </div>
        <div style={{padding:14}}>
          {loading?<div style={{textAlign:"center",padding:20,color:"#94a3b8"}}>Loading...</div>:(
            <div style={{display:"grid",gap:8}}>
              {docs.map(doc=>{
                const up=files[doc.key],isUp=uploading[doc.key],isDel=deleting[doc.key];
                return(
                  <div key={doc.key} style={{background:up?"#f0fdf4":"#f8fafc",border:"1px solid "+(up?"#86efac":"#e2e8f0"),borderRadius:10,padding:"10px 12px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:12,fontWeight:600,color:"#1e293b"}}>{doc.label}</div>
                      <div style={{fontSize:10,color:"#94a3b8"}}>PDF · Max {doc.maxMB}MB</div>
                      {up&&<div style={{fontSize:10,color:"#16a34a",marginTop:2}}>✅ {fmtSize(up.size)} · {new Date(up.uploaded).toLocaleDateString("en-IN")}</div>}
                    </div>
                    <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
                      {up&&<a href={r2ViewUrl(up.key)} target="_blank" rel="noreferrer" style={{background:"#dbeafe",color:"#1d4ed8",borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:600,textDecoration:"none"}}>👁 View</a>}
                      {canUpload&&<>
                        <input type="file" accept=".pdf" ref={el=>fileRefs.current[doc.key]=el}
                          onChange={e=>{const f=e.target.files[0];if(f)handleUpload(doc.key,f,doc.maxMB);e.target.value="";}}
                          style={{display:"none"}}/>
                        <button onClick={()=>fileRefs.current[doc.key]?.click()} disabled={isUp}
                          style={{background:up?"#fef3c7":"#dcfce7",color:up?"#d97706":"#16a34a",border:"none",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:600}}>
                          {isUp?"⏳":up?"🔄 Replace":"⬆ Upload"}
                        </button>
                      </>}
                      {canDelete&&up&&<button onClick={()=>handleDelete(doc.key)} disabled={isDel}
                        style={{background:"#fee2e2",color:"#dc2626",border:"none",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:11,fontWeight:600}}>
                        {isDel?"⏳":"🗑"}
                      </button>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div style={{marginTop:10,padding:"8px 12px",background:"#f0fdf4",borderRadius:8,fontSize:11,color:"#15803d"}}>
            📌 {Object.keys(files).length} of {docs.length} documents uploaded
          </div>
        </div>
      </div>
    </div>
  );
}


function BRCDocsModal({brc, canUpload, canDelete, onClose}){
  const [files,setFiles]=useState({});
  const [loading,setLoading]=useState(true);
  const [uploading,setUploading]=useState({});
  const [deleting,setDeleting]=useState({});
  const fileRefs=useRef({});
  const folder=`brc/${String(brc.brc_no||brc.id||"").trim()}`;
  const docs=[
    {key:"brc_copy", label:"BRC Copy", accept:".pdf", maxMB:3},
    {key:"other",    label:"Other",    accept:".pdf", maxMB:5},
  ];
  const loadFiles=async()=>{
    setLoading(true);
    try{
      const list=await r2List(folder);
      const m={};
      list.forEach(f=>{m[f.docType]=f;});
      setFiles(m);
      console.log("BRC r2List result for",folder,":",list);
    }catch(e){console.error("BRC docs error:",e);}
    setLoading(false);
  };
  useEffect(()=>{loadFiles();},[]);
  const handleUpload=async(key,file,maxMB)=>{
    if(file.size>maxMB*1024*1024){alert("Max "+maxMB+"MB");return;}
    if(!file.name.match(/\.pdf$/i)){alert("PDF only");return;}
    setUploading(u=>({...u,[key]:true}));
    try{
      if(files[key]) await r2Delete(files[key].key);
      await r2Upload(folder,key,file);
      await loadFiles();
    }catch(e){alert("Upload failed: "+e.message); console.error(e);}
    setUploading(u=>({...u,[key]:false}));
  };
  const handleDelete=async(key)=>{
    if(!window.confirm("Delete?"))return;
    setDeleting(d=>({...d,[key]:true}));
    try{await r2Delete(files[key].key);await loadFiles();}
    catch(e){alert("Delete failed: "+e.message);}
    setDeleting(d=>({...d,[key]:false}));
  };
  const fmtSize=b=>b<1024*1024?(b/1024).toFixed(0)+"KB":(b/1024/1024).toFixed(1)+"MB";
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,padding:10}}>
      <div style={{background:"#fff",borderRadius:14,width:"100%",maxWidth:480,maxHeight:"90vh",overflow:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{background:"linear-gradient(135deg,#15803d,#16a34a)",borderRadius:"14px 14px 0 0",padding:"14px 18px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontWeight:700,color:"#fff",fontSize:15}}>✅ BRC Documents — {brc.brc_no||"—"}</div>
            <div style={{fontSize:11,color:"#bbf7d0",marginTop:2}}>Date: {brc.brc_date||"—"} · Amount: {fU(brc.brc_amt_usd||0)}{brc.linked_invoice_no?" · Invoice: "+brc.linked_invoice_no:""}</div>
          </div>
          <button onClick={onClose} style={{background:"rgba(255,255,255,0.2)",border:"none",color:"#fff",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontWeight:600}}>✕</button>
        </div>
        <div style={{padding:14}}>
          {loading?<div style={{textAlign:"center",padding:20,color:"#94a3b8"}}>Loading...</div>:(
            <div style={{display:"grid",gap:8}}>
              {docs.map(doc=>{
                const up=files[doc.key],isUp=uploading[doc.key],isDel=deleting[doc.key];
                return(
                  <div key={doc.key} style={{background:up?"#f0fdf4":"#f8fafc",border:"1px solid "+(up?"#86efac":"#e2e8f0"),borderRadius:10,padding:"10px 12px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:12,fontWeight:600,color:"#1e293b"}}>{doc.label}</div>
                      <div style={{fontSize:10,color:"#94a3b8"}}>PDF · Max {doc.maxMB}MB</div>
                      {up&&<div style={{fontSize:10,color:"#16a34a",marginTop:2}}>✅ {fmtSize(up.size)} · {new Date(up.uploaded).toLocaleDateString("en-IN")}</div>}
                    </div>
                    <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
                      {up&&<a href={r2ViewUrl(up.key)} target="_blank" rel="noreferrer" style={{background:"#dbeafe",color:"#1d4ed8",borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:600,textDecoration:"none"}}>👁 View</a>}
                      {canUpload&&<>
                        <input type="file" accept=".pdf" ref={el=>fileRefs.current[doc.key]=el}
                          onChange={e=>{const f=e.target.files[0];if(f)handleUpload(doc.key,f,doc.maxMB);e.target.value="";}}
                          style={{display:"none"}}/>
                        <button onClick={()=>fileRefs.current[doc.key]?.click()} disabled={isUp}
                          style={{background:up?"#fef3c7":"#dcfce7",color:up?"#d97706":"#16a34a",border:"none",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:600}}>
                          {isUp?"⏳":up?"🔄 Replace":"⬆ Upload"}
                        </button>
                      </>}
                      {canDelete&&up&&<button onClick={()=>handleDelete(doc.key)} disabled={isDel}
                        style={{background:"#fee2e2",color:"#dc2626",border:"none",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:11,fontWeight:600}}>
                        {isDel?"⏳":"🗑"}
                      </button>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div style={{marginTop:10,padding:"8px 12px",background:"#f0fdf4",borderRadius:8,fontSize:11,color:"#15803d"}}>
            📌 {Object.keys(files).length} of {docs.length} documents uploaded
          </div>
        </div>
      </div>
    </div>
  );
}


function ShipDocsModal({shipment, canUpload, canDelete, onClose}){
  const [files,setFiles]=useState({});
  const [loading,setLoading]=useState(true);
  const [uploading,setUploading]=useState({});
  const [deleting,setDeleting]=useState({});
  const fileRefs=useRef({});
  const folder=`shipments/${String(shipment.invoice_no||shipment.id||"").trim().replace(/ /g,"-")}`;

  const loadFiles=async()=>{
    setLoading(true);
    try{
      const list=await r2List(folder);
      const m={};
      list.forEach(f=>{m[f.docType]=f;});
      setFiles(m);
    }catch(e){console.error(e);}
    setLoading(false);
  };
  useEffect(()=>{loadFiles();},[]);

  const handleUpload=async(docKey,file,maxMB,accept)=>{
    const ext=file.name.split(".").pop().toLowerCase();
    const allowed=accept.split(",").map(a=>a.trim().replace(".",""));
    if(!allowed.includes(ext)){alert("Allowed formats: "+accept);return;}
    if(file.size>maxMB*1024*1024){alert(`File too large. Max size: ${maxMB}MB`);return;}
    setUploading(u=>({...u,[docKey]:true}));
    try{
      if(files[docKey]) await r2Delete(files[docKey].key);
      await r2Upload(folder,docKey,file);
      await loadFiles();
    }catch(e){alert("Upload failed: "+e.message);}
    setUploading(u=>({...u,[docKey]:false}));
  };

  const handleDelete=async(docKey)=>{
    if(!window.confirm("Delete this document?"))return;
    setDeleting(d=>({...d,[docKey]:true}));
    try{await r2Delete(files[docKey].key);await loadFiles();}
    catch(e){alert("Delete failed: "+e.message);}
    setDeleting(d=>({...d,[docKey]:false}));
  };

  const fmtSize=b=>b<1024*1024?(b/1024).toFixed(0)+"KB":(b/1024/1024).toFixed(1)+"MB";
  const uploaded=Object.keys(files).length;

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",display:"flex",
                 alignItems:"center",justifyContent:"center",zIndex:200,padding:10}}>
      <div style={{background:"#fff",borderRadius:14,width:"100%",maxWidth:620,
                   maxHeight:"92vh",overflow:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        {/* Header */}
        <div style={{background:"linear-gradient(135deg,#1e3a5f,#2563eb)",
                     borderRadius:"14px 14px 0 0",padding:"14px 18px",
                     display:"flex",justifyContent:"space-between",alignItems:"center",
                     position:"sticky",top:0,zIndex:10}}>
          <div>
            <div style={{fontWeight:700,color:"#fff",fontSize:15}}>📁 Documents — {shipment.invoice_no}</div>
            <div style={{fontSize:11,color:"#bfdbfe",marginTop:2}}>
              {shipment.buyer_name} · {shipment.invoice_date} · {uploaded}/{SHIP_DOCS.length} uploaded
            </div>
          </div>
          <button onClick={onClose}
            style={{background:"rgba(255,255,255,0.2)",border:"none",color:"#fff",
                    borderRadius:6,padding:"5px 12px",cursor:"pointer",fontWeight:600,fontSize:14}}>✕</button>
        </div>

        <div style={{padding:14}}>
          {loading
            ? <div style={{textAlign:"center",padding:30,color:"#94a3b8"}}>⏳ Loading documents...</div>
            : <div style={{display:"grid",gap:7}}>
                {SHIP_DOCS.map(doc=>{
                  const up=files[doc.key],isUp=uploading[doc.key],isDel=deleting[doc.key];
                  return(
                    <div key={doc.key}
                      style={{background:up?"#f0fdf4":"#f8fafc",
                              border:`1px solid ${up?"#86efac":"#e2e8f0"}`,
                              borderRadius:10,padding:"10px 12px",
                              display:"flex",justifyContent:"space-between",
                              alignItems:"center",gap:8,flexWrap:"wrap"}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:12,fontWeight:600,color:"#1e293b"}}>{doc.label}</div>
                        <div style={{fontSize:10,color:"#94a3b8",marginTop:1}}>{doc.accept} · Max {doc.maxMB}MB</div>
                        {up&&<div style={{fontSize:10,color:"#16a34a",marginTop:2}}>
                          ✅ {fmtSize(up.size)} · {up.uploaded?new Date(up.uploaded).toLocaleDateString("en-IN"):""}
                        </div>}
                      </div>
                      <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
                        {up&&<a href={r2ViewUrl(up.key)} target="_blank" rel="noreferrer"
                          style={{background:"#dbeafe",color:"#1d4ed8",borderRadius:6,
                                  padding:"4px 10px",fontSize:11,fontWeight:600,textDecoration:"none"}}>
                          👁 View
                        </a>}
                        {canUpload&&<>
                          <input type="file" accept={doc.accept}
                            ref={el=>fileRefs.current[doc.key]=el}
                            onChange={e=>{const f=e.target.files[0];if(f)handleUpload(doc.key,f,doc.maxMB,doc.accept);e.target.value="";}}
                            style={{display:"none"}}/>
                          <button onClick={()=>fileRefs.current[doc.key]?.click()}
                            disabled={isUp}
                            style={{background:up?"#fef3c7":"#dcfce7",
                                    color:up?"#d97706":"#16a34a",
                                    border:"none",borderRadius:6,padding:"4px 10px",
                                    cursor:"pointer",fontSize:11,fontWeight:600}}>
                            {isUp?"⏳":up?"🔄 Replace":"⬆ Upload"}
                          </button>
                        </>}
                        {canDelete&&up&&<button onClick={()=>handleDelete(doc.key)}
                          disabled={isDel}
                          style={{background:"#fee2e2",color:"#dc2626",border:"none",
                                  borderRadius:6,padding:"4px 8px",cursor:"pointer",
                                  fontSize:11,fontWeight:600}}>
                          {isDel?"⏳":"🗑"}
                        </button>}
                      </div>
                    </div>
                  );
                })}
              </div>
          }
          <div style={{marginTop:12,padding:"10px 12px",background:"#f0fdf4",
                       borderRadius:8,fontSize:11,color:"#15803d",fontWeight:600}}>
            📌 {uploaded} of {SHIP_DOCS.length} documents uploaded
          </div>
        </div>
      </div>
    </div>
  );
}


function BCDocsModal({bc, canUpload, canDelete, onClose}){
  const [files, setFiles] = useState({});
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState({});
  const [deleting, setDeleting] = useState({});
  const fileRefs = useRef({});
  const folder = `bc/${String(bc.bc_no||bc.id||"").trim()}`;

  const loadFiles = async () => {
    setLoading(true);
    try {
      const list = await r2List(folder);
      const map = {};
      list.forEach(f => { map[f.docType] = f; });
      setFiles(map);
    } catch(e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { loadFiles(); }, []);

  const handleUpload = async (docKey, file, maxMB) => {
    if(file.size > maxMB*1024*1024){ alert(`File too large. Max size: ${maxMB}MB`); return; }
    if(!file.name.match(/\.pdf$/i)){ alert("Only PDF files allowed."); return; }
    setUploading(u=>({...u,[docKey]:true}));
    try {
      if(files[docKey]) await r2Delete(files[docKey].key);
      const uploadedKey = await r2Upload(folder, docKey, file);
      console.log("Uploaded successfully, key:", uploadedKey);
      await loadFiles();
    } catch(e){ alert("Upload failed: "+e.message); console.error("Upload error:", e); }
    setUploading(u=>({...u,[docKey]:false}));
  };

  const handleDelete = async (docKey) => {
    if(!window.confirm("Delete this document?")) return;
    setDeleting(d=>({...d,[docKey]:true}));
    try { await r2Delete(files[docKey].key); await loadFiles(); }
    catch(e){ alert("Delete failed: "+e.message); }
    setDeleting(d=>({...d,[docKey]:false}));
  };

  const fmtSize = bytes => bytes<1024*1024?(bytes/1024).toFixed(0)+"KB":(bytes/1024/1024).toFixed(1)+"MB";

  // BC level docs only — IRM/BRC have their own separate doc modals
  const bcLevelDocs = BC_DOCS;
  const irmDocs = (bc.irm_entries||[]).map((irm,i) => ({
    key:`irm_${i}`,
    label:`IRM Copy — ${irm.irm_no||"IRM #"+(i+1)}`,
    accept:".pdf", maxMB:3,
    sub: irm.irm_no ? `IRM No: ${irm.irm_no} | Date: ${irm.irm_date||"—"} | Amt: USD ${irm.irm_total_usd||irm.irm_amt_usd||0}` : ""
  }));
  const brcDocs = (bc.brc_entries||[]).map((brc,i) => ({
    key:`brc_${i}`,
    label:`BRC Copy — ${brc.brc_no||"BRC #"+(i+1)}`,
    accept:".pdf", maxMB:3,
    sub: brc.brc_no ? `BRC No: ${brc.brc_no} | Date: ${brc.brc_date||"—"} | Amt: USD ${brc.brc_amt_usd||0}` : ""
  }));
  const allDocs = [...bcLevelDocs, ...irmDocs, ...brcDocs];

  const renderDocRow = (doc) => {
    const uploaded=files[doc.key];
    const isUploading=uploading[doc.key];
    const isDeleting=deleting[doc.key];
    return(
      <div key={doc.key} style={{background:uploaded?"#f0fdf4":"#f8fafc",border:`1px solid ${uploaded?"#86efac":"#e2e8f0"}`,borderRadius:10,padding:"10px 12px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:12,fontWeight:600,color:"#1e293b"}}>{doc.label}</div>
          {doc.sub&&<div style={{fontSize:10,color:"#0369a1",marginTop:1}}>{doc.sub}</div>}
          <div style={{fontSize:10,color:"#94a3b8",marginTop:1}}>PDF only · Max {doc.maxMB}MB</div>
          {uploaded&&<div style={{fontSize:10,color:"#16a34a",marginTop:2}}>✅ {fmtSize(uploaded.size)} · {new Date(uploaded.uploaded).toLocaleDateString("en-IN")}</div>}
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
          {uploaded&&<a href={r2ViewUrl(uploaded.key)} target="_blank" rel="noreferrer" style={{background:"#dbeafe",color:"#1d4ed8",borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:600,textDecoration:"none"}}>👁 View</a>}
          {canUpload&&(
            <>
              <input type="file" accept=".pdf" ref={el=>fileRefs.current[doc.key]=el} onChange={e=>{const f=e.target.files[0];if(f)handleUpload(doc.key,f,doc.maxMB);e.target.value="";}} style={{display:"none"}}/>
              <button onClick={()=>fileRefs.current[doc.key]?.click()} disabled={isUploading} style={{background:uploaded?"#fef3c7":"#dcfce7",color:uploaded?"#d97706":"#16a34a",border:"none",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:600}}>
                {isUploading?"⏳":uploaded?"🔄 Replace":"⬆ Upload"}
              </button>
            </>
          )}
          {canDelete&&uploaded&&<button onClick={()=>handleDelete(doc.key)} disabled={isDeleting} style={{background:"#fee2e2",color:"#dc2626",border:"none",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:11,fontWeight:600}}>{isDeleting?"⏳":"🗑"}</button>}
        </div>
      </div>
    );
  };

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:10}}>
      <div style={{background:"#fff",borderRadius:14,width:"100%",maxWidth:580,maxHeight:"95vh",overflow:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.35)"}}>
        <div style={{background:"linear-gradient(135deg,#15803d,#16a34a)",padding:"14px 18px",display:"flex",justifyContent:"space-between",alignItems:"center",position:"sticky",top:0,zIndex:10}}>
          <div>
            <div style={{fontWeight:700,color:"#fff",fontSize:14}}>📁 BC Documents — {bc.bc_no}</div>
            <div style={{fontSize:11,color:"#bbf7d0"}}>{bc.bank_name} · {bc.bc_date||"—"}</div>
          </div>
          <button onClick={onClose} style={{background:"rgba(255,255,255,0.2)",border:"none",color:"#fff",borderRadius:6,padding:"5px 12px",cursor:"pointer",fontWeight:600}}>✕</button>
        </div>
        {loading?(
          <div style={{padding:30,textAlign:"center",color:"#64748b"}}>Loading documents...</div>
        ):(
          <div style={{padding:14}}>
            {/* ── BC Level Documents ── */}
            <div style={{background:"#1e3a5f",borderRadius:8,padding:"8px 12px",marginBottom:8,display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:14}}>🏦</span>
              <span style={{fontWeight:700,color:"#fff",fontSize:12}}>BC Level Documents</span>
              <span style={{fontSize:10,color:"#93c5fd",marginLeft:"auto"}}>{bcLevelDocs.filter(d=>files[d.key]).length}/{bcLevelDocs.length} uploaded</span>
            </div>
            <div style={{display:"grid",gap:6,marginBottom:14}}>
              {bcLevelDocs.map(doc=>renderDocRow(doc))}
            </div>

            {/* ── IRM-wise Documents ── */}
            {irmDocs.length>0&&<>
              <div style={{background:"#0369a1",borderRadius:8,padding:"8px 12px",marginBottom:8,display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:14}}>📥</span>
                <span style={{fontWeight:700,color:"#fff",fontSize:12}}>IRM Documents ({irmDocs.length} entries)</span>
                <span style={{fontSize:10,color:"#bae6fd",marginLeft:"auto"}}>{irmDocs.filter(d=>files[d.key]).length}/{irmDocs.length} uploaded</span>
              </div>
              <div style={{display:"grid",gap:6,marginBottom:14}}>
                {irmDocs.map(doc=>renderDocRow(doc))}
              </div>
            </>}

            {/* ── BRC-wise Documents ── */}
            {brcDocs.length>0&&<>
              <div style={{background:"#15803d",borderRadius:8,padding:"8px 12px",marginBottom:8,display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:14}}>✅</span>
                <span style={{fontWeight:700,color:"#fff",fontSize:12}}>BRC Documents ({brcDocs.length} entries)</span>
                <span style={{fontSize:10,color:"#bbf7d0",marginLeft:"auto"}}>{brcDocs.filter(d=>files[d.key]).length}/{brcDocs.length} uploaded</span>
              </div>
              <div style={{display:"grid",gap:6,marginBottom:14}}>
                {brcDocs.map(doc=>renderDocRow(doc))}
              </div>
            </>}

            <div style={{marginTop:4,padding:"10px 12px",background:"#f0fdf4",borderRadius:8,fontSize:11,color:"#15803d"}}>
              📌 {Object.keys(files).length} of {allDocs.length} total documents uploaded
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DetailModal({shipment,bc,allBRCs,allIRMs,onClose,onViewDocs}){
  if(!shipment)return <span/>;
  const s=shipment,c=calcShip(s);
  const shipBRCs=(allBRCs||[]).filter(b=>b.linked_invoice_no===s.invoice_no);
  const brcNos=shipBRCs.map(b=>b.brc_no).filter(Boolean).join(", ")||"—";
  const brcDates=shipBRCs.map(b=>b.brc_date).filter(Boolean).join(", ")||"—";
  const {paidUSD,paidINR}=calcEffectivePaid(s.invoice_no,allBRCs||[],allIRMs||[]);
  const rows=[["FY",getFY(s.invoice_date)],["Invoice Date",s.invoice_date],["Buyer",s.buyer_name],["Country",s.buyer_country],["Product",s.product],["Port of Loading",s.port_of_loading],["Port of Discharge",s.port_of_discharge],["SB No",s.shipping_bill_no],["SB Date",s.shipping_bill_date],["Port Code",s.port_code],["BL No",s.bl_no],["BL Date",s.bl_date],["Qty (MT)",fi(s.qty)],["Rate/MT (USD)",fi(s.rate_per_mt)],["Delivery Terms",s.delivery_terms],["Invoice Amt (USD)",fU(c.invoiceAmtUSD)],["Exchange Rate",fi(s.exchange_rate)],["Invoice Amt (INR)",fR(c.invoiceAmtINR)],["IGST (INR)",fR(s.igst)],["Gross Total (INR)",fR(c.grossTotal)],["FOB (USD)",fU(s.fob_value_usd)],["FOB (INR)",fR(c.fobValueINR)],["RODTEP (INR)",fR(s.rodtep_amount)],["RODTEP Status",s.rodtep_status],["GST Status",s.gst_status],["Bill Collection No",bc?bc.bc_no:"—"],["BC Date",bc?bc.bc_date:"—"],["BRC No(s)",brcNos],["BRC Date(s)",brcDates],["Payment Rcvd (USD)",paidUSD>0?fU(paidUSD):"—"],["Payment Rcvd (INR)",paidINR>0?fR(paidINR):"—"],["Balance (USD)",fU(c.invoiceAmtUSD-paidUSD)],["Remarks",s.remarks||"—"]];
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:150,padding:12}}>
      <div style={{background:"#fff",borderRadius:14,padding:24,width:"100%",maxWidth:680,maxHeight:"93vh",overflow:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <h3 style={{margin:0,color:"#1e3a5f"}}>{s.invoice_no}</h3>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>exportShipmentPDF(s,bc)} style={{background:"#eff6ff",color:"#1d4ed8",border:"none",borderRadius:6,padding:"5px 12px",cursor:"pointer",fontWeight:600,fontSize:12}}>📄 PDF</button>
            <button onClick={onViewDocs} style={{background:"#f0fdf4",color:"#16a34a",border:"none",borderRadius:6,padding:"5px 12px",cursor:"pointer",fontWeight:600,fontSize:12}}>📁 Docs</button>
            <button onClick={onClose} style={{background:"#f1f5f9",border:"none",borderRadius:6,padding:"5px 12px",cursor:"pointer",fontWeight:600}}>Close</button>
          </div>
        </div>
        {rows.map(([l,v])=><div key={l} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #f1f5f9",fontSize:13}}><span style={{color:"#64748b"}}>{l}</span><span style={{fontWeight:600,color:"#1e293b",textAlign:"right",maxWidth:"55%"}}>{v}</span></div>)}
      </div>
    </div>
  );
}

function ProfitabilityContent({fy,fyProfits,ships,canEdit,canDelete,openAddProfit,openEditProfit,onDelete,onExportSingle}){
  const totP=fyProfits.reduce((a,p)=>{
    try{ const c=calcProfit(p,ships); a.invINR+=n(p.invoice_amt_inr); a.paidINR+=n(p.payment_received_inr); a.totalCIF+=c.totalCIF; a.profit+=c.profit; }catch(e){}
    return a;
  },{invINR:0,paidINR:0,totalCIF:0,profit:0});
  return(
    <>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10,marginBottom:16}}>
        {[{l:"Invoice (INR)",v:fR(totP.invINR),c:"#0369a1"},{l:"Payment (INR)",v:fR(totP.paidINR),c:"#15803d"},{l:"Total CIF (INR)",v:fR(totP.totalCIF),c:"#d97706"},{l:"Net Profit (INR)",v:fR(totP.profit),c:totP.profit>=0?"#16a34a":"#dc2626"}].map((x,i)=>(
          <div key={i} style={{background:"#fff",borderRadius:10,padding:"13px 14px",boxShadow:"0 1px 4px rgba(0,0,0,0.07)",borderTop:`3px solid ${x.c}`}}>
            <div style={{fontSize:14,fontWeight:700,color:x.c,wordBreak:"break-all"}}>{x.v}</div>
            <div style={{fontSize:11,color:"#64748b",marginTop:3}}>{x.l}</div>
          </div>
        ))}
      </div>
      {fyProfits.length===0
        ?<div style={{background:"#fff",borderRadius:12,padding:50,textAlign:"center",color:"#94a3b8"}}><div style={{fontSize:36,marginBottom:10}}>📊</div><div style={{fontSize:15,fontWeight:600,marginBottom:6}}>No entries for FY {fy}</div>{canEdit&&<button onClick={openAddProfit} style={{background:"linear-gradient(135deg,#1e3a5f,#16a34a)",color:"#fff",border:"none",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontWeight:600,marginTop:10}}>+ Add First Entry</button>}</div>
        :<div style={{display:"grid",gap:14}}>
          {fyProfits.map(p=>{
            let c={interest:0,bankCh:0,totalFOB:0,totalCIF:0,profit:0};
            try{c=calcProfit(p,ships);}catch(e){}
            return(
              <div key={p.id} style={{background:"#fff",borderRadius:12,overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,0.07)"}}>
                <div style={{background:"linear-gradient(135deg,#1e3a5f,#1e5799)",padding:"11px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
                  <div><span style={{fontWeight:700,color:"#fff",fontSize:14}}>{p.invoice_no}</span><span style={{marginLeft:10,fontSize:12,color:"#93c5fd"}}>{p.invoice_date} · {p.buyer_name}</span></div>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <div style={{textAlign:"right"}}><div style={{fontSize:10,color:"#93c5fd"}}>Net Profit</div><div style={{fontSize:17,fontWeight:700,color:c.profit>=0?"#86efac":"#fca5a5"}}>{fR(c.profit)}</div></div>
                    <button onClick={()=>exportProfitPDF(p,ships)} style={{background:"rgba(255,255,255,0.15)",color:"#fff",border:"none",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:11,fontWeight:600}}>📄 PDF</button>
                    {canEdit&&<button onClick={()=>openEditProfit(p)} style={{background:"rgba(255,255,255,0.15)",color:"#fff",border:"none",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:600}}>Edit</button>}
                    {canDelete&&<button onClick={()=>onDelete(p.id)} style={{background:"rgba(220,38,38,0.3)",color:"#fca5a5",border:"none",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:11}}>Del</button>}
                  </div>
                </div>
                <div style={{padding:"12px 16px"}}>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(185px,1fr))",gap:12}}>
                    <div style={{borderRight:"1px solid #f1f5f9",paddingRight:12}}><div style={{fontSize:11,fontWeight:700,color:"#0369a1",marginBottom:6}}>REVENUE</div><Row l="Invoice (INR)" v={fR(p.invoice_amt_inr)}/><Row l="Payment (INR)" v={fR(p.payment_received_inr)}/></div>
                    <div style={{borderRight:"1px solid #f1f5f9",paddingRight:12}}><div style={{fontSize:11,fontWeight:700,color:"#d97706",marginBottom:6}}>DIRECT COSTS</div><Row l="Rice Purchase" v={fR(p.rice_purchase_val)}/><Row l="PP Bags" v={fR(p.pp_bags_purchase_val)}/><Row l="Local Transport" v={fR(p.local_transport)}/><Row l="Interest (1%)" v={fR(c.interest)}/><Row l="Bank Charges" v={fR(c.bankCh)}/><Row l="Ocean Freight" v={fR(p.ocean_freight)}/><Row l="Total Direct" v={fR(c.totalDirect)} bold col="#d97706"/></div>
                    <div style={{borderRight:"1px solid #f1f5f9",paddingRight:12}}><div style={{fontSize:11,fontWeight:700,color:"#7c3aed",marginBottom:6}}>FOB COSTS</div><Row l="CHA & Clearing" v={fR(p.cha_clearing)}/><Row l="Shipping Line" v={fR(p.shipping_line_charges)}/><Row l="Inspection" v={fR(p.inspect_agency)}/><Row l="COC/ECTN" v={fR(p.coc_ectn)}/><Row l="Other Exp" v={fR(p.other_exp)}/><Row l="Local Brokerage (100/MT)" v={fR(c.localBrokerage)}/><Row l="Total FOB" v={fR(c.totalFOB)} bold col="#7c3aed"/></div>
                    <div><div style={{fontSize:11,fontWeight:700,color:"#1e3a5f",marginBottom:6}}>SUMMARY</div><Row l="Total CIF Cost" v={fR(c.totalCIF)} bold col="#d97706"/><Row l="Payment (INR)" v={fR(p.payment_received_inr)} col="#15803d"/><Row l="Net Profit" v={fR(c.profit)} bold col={c.profit>=0?"#16a34a":"#dc2626"}/></div>
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
        <h3 style={{margin:"0 0 4px",color:"#1e3a5f",fontSize:15}}>{editId?"Edit":"Add"} Profitability Entry — FY {fy}</h3>
        <p style={{margin:"0 0 14px",fontSize:11.5,color:"#64748b"}}>Select invoice to auto-fill. Blue = read-only.</p>
        <SH t="Invoice Selection *"/>
        <div style={{marginBottom:14}}>
          <label style={{fontSize:11.5,fontWeight:600,color:"#374151",display:"block",marginBottom:3}}>Invoice No *</label>
          <select value={form.invoice_no||""} onChange={e=>onSelectInvoice(e.target.value)} style={{...iS,borderColor:form.invoice_no?"#e2e8f0":"#dc2626"}}>
            <option value="">Select Invoice</option>
            {fyShips.map(s=><option key={s.id}>{s.invoice_no}</option>)}
          </select>
          {!form.invoice_no&&<p style={{color:"#dc2626",fontSize:11,margin:"3px 0 0"}}>Mandatory</p>}
        </div>
        <SH t="Auto-filled from Shipment (Read Only)" color="#0369a1" bg="#e0f2fe"/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
          {ro("Invoice Date",form.invoice_date||"—")}
          {ro("Buyer Name",form.buyer_name||"—")}
          {ro("Port of Discharge",form.port_of_discharge||"—")}
          {ro("Invoice Amount (INR)",fR(form.invoice_amt_inr||0))}
          {ro("Payment Received (INR)",fR(form.payment_received_inr||0))}
        </div>
        <SH t="Direct Costs (INR)" color="#d97706" bg="#fef3c7"/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
          {fld("rice_purchase_val","Rice Purchase Value")}
          {fld("pp_bags_purchase_val","PP Bags Purchase Value")}
          {fld("local_transport","Local Transport")}
          {ro("Interest Cost (1% of Rice Purchase)",fR(calc.interest||0))}
          {ro("Bank Charges (0.11% of Pmt Rcvd)",fR(calc.bankCh||0))}
          {fld("ocean_freight","Ocean Freight Exp")}
          {ro("Total Direct Cost",fR(calc.totalDirect||0))}
        </div>
        <SH t="FOB Cost Head (INR)" color="#7c3aed" bg="#f3e8ff"/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
          {fld("cha_clearing","CHA & Clearing Exp")}
          {fld("shipping_line_charges","Shipping Line Charges")}
          {fld("inspect_agency","Inspection Agency Exp")}
          {fld("coc_ectn","COC / ECTN Exp")}
          {fld("other_exp","Other Exp")}
          {ro("Local Brokerage (Auto @ INR 100/MT)",fR(calc.localBrokerage||0))}
          {ro("Total FOB Cost",fR(calc.totalFOB||0))}
        </div>
        <div style={{background:"#1e3a5f",borderRadius:10,padding:14,marginBottom:14,display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
          <div><div style={{fontSize:10,color:"#93c5fd",marginBottom:1}}>Total CIF Cost</div><div style={{fontSize:17,fontWeight:700,color:"#fbbf24"}}>{fR(calc.totalCIF||0)}</div></div>
          <div><div style={{fontSize:10,color:"#93c5fd",marginBottom:1}}>Payment Received</div><div style={{fontSize:17,fontWeight:700,color:"#fff"}}>{fR(form.payment_received_inr||0)}</div></div>
          <div><div style={{fontSize:10,color:"#93c5fd",marginBottom:1}}>Net Profit</div><div style={{fontSize:17,fontWeight:700,color:(calc.profit||0)>=0?"#86efac":"#fca5a5"}}>{fR(calc.profit||0)}</div></div>
        </div>
        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
          <button onClick={onClose} style={{background:"#f1f5f9",color:"#64748b",border:"none",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontWeight:600}}>Cancel</button>
          <button onClick={onSave} disabled={saving} style={{background:"linear-gradient(135deg,#1e3a5f,#16a34a)",color:"#fff",border:"none",borderRadius:8,padding:"8px 22px",cursor:"pointer",fontWeight:700}}>{saving?"Saving...":"Save Entry"}</button>
        </div>
      </div>
    </div>
  );
}




function EditChanges({newData,oldData}){
  const changed=Object.keys(newData).filter(k=>newData[k]!==oldData[k]&&newData[k]!==null&&newData[k]!==undefined&&newData[k]!=="");
  if(!changed.length) return null;
  return(
    <div style={{background:"#fffbeb",borderRadius:8,padding:"8px 12px",border:"1px solid #fde68a",marginTop:8}}>
      <div style={{fontSize:11,fontWeight:700,color:"#92400e",marginBottom:6}}>📝 Changed fields:</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4}}>
        {changed.map(k=>(
          <div key={k} style={{fontSize:11,background:"#fff",borderRadius:4,padding:"4px 8px"}}>
            <div style={{color:"#94a3b8",fontSize:10}}>{k.replace(/_/g," ")}</div>
            <div style={{color:"#dc2626",textDecoration:"line-through",fontSize:11}}>{String(oldData[k]||"—")}</div>
            <div style={{color:"#16a34a",fontWeight:600,fontSize:11}}>{String(newData[k])}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Small helper components for approval UI ─────────────────────────────────
function ApprovalBtn({pendings,onClick}){
  const cnt=pendings.filter(p=>p.status==="pending").length;
  return(
    <button onClick={onClick} style={{background:cnt>0?"rgba(239,68,68,0.8)":"rgba(255,255,255,0.15)",border:"none",color:"#fff",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontSize:11,fontWeight:600}}>
      ✅ Approvals{cnt>0&&<span style={{background:"#fbbf24",color:"#1e3a5f",borderRadius:10,padding:"1px 6px",fontSize:10,fontWeight:800,marginLeft:5}}>{cnt}</span>}
    </button>
  );
}

function MyRequestsBtn({pendings,userId,onClick}){
  const mine=pendings.filter(p=>String(p.submitted_by)===String(userId));
  const rej=mine.filter(p=>p.status==="rejected").length;
  const pend=mine.filter(p=>p.status==="pending").length;
  return(
    <button onClick={onClick} style={{background:rej>0?"rgba(239,68,68,0.8)":pend>0?"rgba(251,191,36,0.8)":"rgba(255,255,255,0.15)",border:"none",color:"#fff",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontSize:11,fontWeight:600}}>
      📋 My Requests{(rej>0||pend>0)&&<span style={{background:"#fff",color:"#1e3a5f",borderRadius:10,padding:"1px 6px",fontSize:10,fontWeight:800,marginLeft:5}}>{rej>0?rej:pend}</span>}
    </button>
  );
}

function JuniorPendingBanner({pendings,userId,onViewRejected}){
  const myPend=pendings.filter(p=>String(p.submitted_by)===String(userId)&&p.status==="pending");
  const myRej=pendings.filter(p=>String(p.submitted_by)===String(userId)&&p.status==="rejected");
  if(!myPend.length&&!myRej.length) return null;
  return(
    <>
      {myPend.length>0&&<div style={{background:"#fef3c7",border:"1px solid #fbbf24",borderRadius:8,padding:"8px 14px",marginBottom:8,fontSize:12,color:"#92400e",fontWeight:600}}>
        ⏳ {myPend.length} entry(s) waiting for approval
      </div>}
      {myRej.length>0&&<div style={{background:"#fee2e2",border:"1px solid #fca5a5",borderRadius:8,padding:"8px 14px",marginBottom:8,fontSize:12,color:"#dc2626",fontWeight:600,cursor:"pointer"}} onClick={onViewRejected}>
        ❌ {myRej.length} entry(s) rejected — tap to view reason
      </div>}
    </>
  );
}

// ─── Approvals Modal ─────────────────────────────────────────────────────────
function ApprovalsModal({pendings,userInfo,onClose,onRefresh,ships,onResubmit,onDeleteRejected}){
  const isJunior=userInfo?.role==="junior_accountant";
  const isAdmin=userInfo?.role==="admin";
  const isSenior=userInfo?.role==="senior_accountant";
  const canReview=isAdmin||isSenior;
  const [rejectNote,setRejectNote]=useState("");
  const [rejectId,setRejectId]=useState(null);
  const [saving,setSaving]=useState(false);
  const [activeTab,setActiveTab]=useState("pending");

  // Debug: log what we're working with
  console.log("[Approvals Debug] isJunior:", isJunior, "userInfo.id:", userInfo?.id, "total pendings:", pendings.length);
  console.log("[Approvals Debug] pendings statuses:", pendings.map(p=>({status:p.status,submitted_by:p.submitted_by,id:p.id})));
  const myItems=isJunior?pendings.filter(p=>{
    const match=String(p.submitted_by)===String(userInfo?.id);
    console.log("[Approvals Debug] p.submitted_by:",p.submitted_by,"userInfo.id:",userInfo?.id,"match:",match);
    return match;
  }):pendings;
  const shown=myItems.filter(p=>p.status===activeTab);
  console.log("[Approvals Debug] activeTab:", activeTab, "myItems:", myItems.length, "shown:", shown.length);

  const approve=async(pc)=>{
    setSaving(true);
    try{
      if(pc.action==="add"){
        await fetch(`${SUPABASE_URL}/rest/v1/shipments`,{method:"POST",headers:{"apikey":SUPABASE_KEY,"Authorization":`Bearer ${SUPABASE_KEY}`,"Content-Type":"application/json","Prefer":"return=representation"},body:JSON.stringify(pc.new_data)});
      } else if(pc.action==="edit"&&pc.record_id){
        await fetch(`${SUPABASE_URL}/rest/v1/shipments?id=eq.${pc.record_id}`,{method:"PATCH",headers:{"apikey":SUPABASE_KEY,"Authorization":`Bearer ${SUPABASE_KEY}`,"Content-Type":"application/json","Prefer":"return=representation"},body:JSON.stringify(pc.new_data)});
      } else if(pc.action==="delete"&&pc.record_id){
        await fetch(`${SUPABASE_URL}/rest/v1/shipments?id=eq.${pc.record_id}`,{method:"DELETE",headers:{"apikey":SUPABASE_KEY,"Authorization":`Bearer ${SUPABASE_KEY}`,"Content-Type":"application/json"}});
      }
      await fetch(`${SUPABASE_URL}/rest/v1/pending_changes?id=eq.${pc.id}`,{method:"PATCH",headers:{"apikey":SUPABASE_KEY,"Authorization":`Bearer ${SUPABASE_KEY}`,"Content-Type":"application/json","Prefer":"return=representation"},body:JSON.stringify({status:"approved",reviewed_by_name:userInfo.name,reviewed_at:new Date().toISOString()})});
      await onRefresh();
    }catch(e){alert("Error: "+e.message);}
    setSaving(false);
  };

  const reject=async(pc)=>{
    if(!rejectNote.trim()){alert("Please enter a rejection reason.");return;}
    setSaving(true);
    try{
      await fetch(`${SUPABASE_URL}/rest/v1/pending_changes?id=eq.${pc.id}`,{method:"PATCH",headers:{"apikey":SUPABASE_KEY,"Authorization":`Bearer ${SUPABASE_KEY}`,"Content-Type":"application/json","Prefer":"return=representation"},body:JSON.stringify({status:"rejected",reviewed_by_name:userInfo.name,reviewed_at:new Date().toISOString(),rejection_note:rejectNote})});
      setRejectId(null);setRejectNote("");
      await onRefresh();
    }catch(e){alert("Error: "+e.message);}
    setSaving(false);
  };

  const actionColors={add:{bg:"#dcfce7",color:"#16a34a",label:"New Entry"},edit:{bg:"#dbeafe",color:"#1d4ed8",label:"Edit"},delete:{bg:"#fee2e2",color:"#dc2626",label:"Delete"}};
  const statusColors={pending:{bg:"#fef3c7",color:"#d97706"},approved:{bg:"#dcfce7",color:"#16a34a"},rejected:{bg:"#fee2e2",color:"#dc2626"}};
  const tabs=canReview?["pending","approved","rejected"]:["pending","approved","rejected"];

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,padding:12}}>
      <div style={{background:"#fff",borderRadius:14,padding:20,width:"100%",maxWidth:680,maxHeight:"93vh",overflow:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div>
            <h3 style={{margin:"0 0 2px",color:"#1e3a5f",fontSize:15}}>{isJunior?"My Requests":"Approval Inbox"}</h3>
            <p style={{margin:0,fontSize:11,color:"#64748b"}}>{canReview?"Review and approve/reject entries submitted by junior accountant":"Track status of your submitted entries"}</p>
          </div>
          <button onClick={onClose} style={{background:"#f1f5f9",border:"none",borderRadius:6,padding:"5px 12px",cursor:"pointer",fontWeight:600}}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{display:"flex",gap:4,marginBottom:14,borderBottom:"2px solid #f1f5f9",paddingBottom:4}}>
          {tabs.map(t=>{
            const cnt=(isJunior?pendings.filter(p=>String(p.submitted_by)===String(userInfo?.id)):pendings).filter(p=>p.status===t).length;
            return(<button key={t} onClick={()=>setActiveTab(t)} style={{background:"none",border:"none",borderBottom:activeTab===t?"2px solid #1e3a5f":"2px solid transparent",color:activeTab===t?"#1e3a5f":"#64748b",padding:"6px 14px",cursor:"pointer",fontWeight:activeTab===t?700:500,fontSize:12,textTransform:"capitalize",marginBottom:-5}}>
              {t} {cnt>0&&<span style={{background:t==="pending"?"#fef3c7":t==="rejected"?"#fee2e2":"#dcfce7",color:t==="pending"?"#d97706":t==="rejected"?"#dc2626":"#16a34a",borderRadius:10,padding:"1px 7px",fontSize:11,fontWeight:700,marginLeft:3}}>{cnt}</span>}
            </button>);
          })}
        </div>

        {shown.length===0&&(
          <div style={{textAlign:"center",padding:"30px 0",color:"#94a3b8"}}>
            <div style={{fontSize:32,marginBottom:8}}>{activeTab==="pending"?"⏳":activeTab==="approved"?"✅":"❌"}</div>
            <div style={{fontSize:13,fontWeight:600}}>No {activeTab} entries</div>
          </div>
        )}

        <div style={{display:"grid",gap:10}}>
          {shown.map(pc=>{
            try{
            const ac=actionColors[pc.action]||{bg:"#f1f5f9",color:"#64748b",label:pc.action};
            const data=(pc.new_data&&typeof pc.new_data==="object"?pc.new_data:null)||(pc.old_data&&typeof pc.old_data==="object"?pc.old_data:null)||{};
            const isRejecting=rejectId===pc.id;
            return(
              <div key={pc.id} style={{background:"#f8fafc",borderRadius:12,overflow:"hidden",border:"1px solid #e2e8f0"}}>
                <div style={{padding:"10px 14px",borderBottom:"1px solid #e2e8f0",display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
                  <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                    <span style={{background:ac.bg,color:ac.color,borderRadius:6,padding:"3px 10px",fontSize:11,fontWeight:700}}>{ac.label}</span>
                    <span style={{fontWeight:700,color:"#1e3a5f",fontSize:13}}>{data.invoice_no||"—"}</span>
                    <span style={{fontSize:11,color:"#64748b"}}>{data.buyer_name} · {data.invoice_date}</span>
                  </div>
                  <div style={{fontSize:11,color:"#94a3b8",textAlign:"right"}}>
                    <div>By: <b style={{color:"#374151"}}>{pc.submitted_by_name}</b></div>
                    <div>{pc.submitted_at?new Date(pc.submitted_at).toLocaleDateString("en-IN")+" "+new Date(pc.submitted_at).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"}):"—"}</div>
                  </div>
                </div>
                <div style={{padding:"10px 14px"}}>
                  {pc.action==="delete"?(
                    <div style={{background:"#fee2e2",borderRadius:8,padding:"10px 14px"}}>
                      <div style={{fontSize:12,color:"#dc2626",fontWeight:700,marginBottom:6}}>⚠️ Request to DELETE this shipment permanently:</div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4,fontSize:11}}>
                        {[["Invoice No",pc.old_data?.invoice_no],["Date",pc.old_data?.invoice_date],["Buyer",pc.old_data?.buyer_name],["Country",pc.old_data?.buyer_country],["Product",pc.old_data?.product],["Qty (MT)",pc.old_data?.qty],["Rate/MT (USD)",pc.old_data?.rate_per_mt],["Terms",pc.old_data?.delivery_terms],["Port Load",pc.old_data?.port_of_loading],["Port Disch",pc.old_data?.port_of_discharge],["SB No",pc.old_data?.shipping_bill_no],["BL No",pc.old_data?.bl_no],["FOB (USD)",pc.old_data?.fob_value_usd],["Exchange Rate",pc.old_data?.exchange_rate]].map(([l,v])=>v?<div key={l} style={{background:"#fff",borderRadius:4,padding:"3px 8px"}}><span style={{color:"#94a3b8",fontSize:10}}>{l}</span><div style={{fontWeight:600,color:"#1e293b",fontSize:11}}>{v}</div></div>:null)}
                      </div>
                    </div>
                  ):(
                    <div>
                      {/* Full detail grid */}
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,fontSize:11,marginBottom:8}}>
                        {[
                          ["Invoice No",data.invoice_no],["Invoice Date",data.invoice_date],
                          ["Buyer Name",data.buyer_name],["Country",data.buyer_country],
                          ["Product",data.product],["Delivery Terms",data.delivery_terms],
                          ["Qty (MT)",data.qty],["Rate/MT (USD)",data.rate_per_mt],
                          ["Exchange Rate",data.exchange_rate],["FOB Value (USD)",data.fob_value_usd],
                          ["Port of Loading",data.port_of_loading],["Port of Discharge",data.port_of_discharge],
                          ["Shipping Bill No",data.shipping_bill_no],["SB Date",data.shipping_bill_date],
                          ["Port Code",data.port_code],["BL No",data.bl_no],
                          ["BL Date",data.bl_date],["IGST (INR)",data.igst],
                          ["RODTEP Amt",data.rodtep_amount],["RODTEP Status",data.rodtep_status],
                          ["GST Status",data.gst_status],["Remarks",data.remarks],
                        ].map(([l,v])=>v!==undefined&&v!==null&&v!==""?
                          <div key={l} style={{background:"#f8fafc",borderRadius:6,padding:"5px 10px",border:"1px solid #e2e8f0"}}>
                            <div style={{color:"#94a3b8",fontSize:10,marginBottom:1}}>{l}</div>
                            <div style={{fontWeight:600,color:"#1e293b",fontSize:12}}>{v}</div>
                          </div>:null
                        )}
                      </div>
                      {/* If edit — show what changed */}
                      {pc.action==="edit"&&pc.old_data&&<EditChanges newData={data} oldData={pc.old_data}/>}
                    </div>
                  )}
                  {pc.action==="edit"&&pc.old_data&&(
                    <div style={{marginTop:8,background:"#fffbeb",borderRadius:6,padding:"6px 10px",fontSize:11,color:"#92400e"}}>
                      📝 Edit request — original: {pc.old_data.invoice_no} · {pc.old_data.buyer_name}
                    </div>
                  )}
                  {pc.status==="rejected"&&pc.rejection_note&&(
                    <div style={{marginTop:8,background:"#fee2e2",borderRadius:6,padding:"8px 10px",fontSize:12}}>
                      <b style={{color:"#dc2626"}}>Rejection reason:</b> <span style={{color:"#7f1d1d"}}>{pc.rejection_note}</span>
                      {pc.reviewed_by_name&&<span style={{color:"#94a3b8",fontSize:11}}> — by {pc.reviewed_by_name}</span>}
                    </div>
                  )}
                  {pc.status==="rejected"&&isJunior&&String(pc.submitted_by)===String(userInfo?.id)&&(
                    <div style={{marginTop:10,display:"flex",gap:8}}>
                      <button onClick={()=>onResubmit&&onResubmit(pc)} style={{background:"#1e3a5f",color:"#fff",border:"none",borderRadius:7,padding:"7px 16px",cursor:"pointer",fontWeight:700,fontSize:12}}>
                        ✏️ Edit & Resubmit
                      </button>
                      <button onClick={async()=>{if(!window.confirm("Delete this rejected entry?"))return;await onDeleteRejected&&onDeleteRejected(pc.id);}} style={{background:"#fee2e2",color:"#dc2626",border:"1px solid #fca5a5",borderRadius:7,padding:"7px 12px",cursor:"pointer",fontWeight:600,fontSize:12}}>
                        🗑 Discard
                      </button>
                    </div>
                  )}
                  {pc.status==="approved"&&(
                    <div style={{marginTop:8,background:"#dcfce7",borderRadius:6,padding:"6px 10px",fontSize:11,color:"#15803d",fontWeight:600}}>
                      ✅ Approved by {pc.reviewed_by_name} on {pc.reviewed_at?new Date(pc.reviewed_at).toLocaleDateString("en-IN"):"—"}
                    </div>
                  )}
                  {isRejecting&&(
                    <div style={{marginTop:10}}>
                      <label style={{fontSize:11.5,fontWeight:600,color:"#dc2626",display:"block",marginBottom:4}}>Rejection Reason *</label>
                      <textarea value={rejectNote} onChange={e=>setRejectNote(e.target.value)} rows={2} placeholder="Enter reason so junior accountant knows what to fix..." style={{width:"100%",border:"1px solid #fca5a5",borderRadius:6,padding:"6px 8px",fontSize:12,outline:"none",resize:"vertical",boxSizing:"border-box"}}/>
                      <div style={{display:"flex",gap:8,marginTop:8}}>
                        <button onClick={()=>reject(pc)} disabled={saving} style={{background:"#dc2626",color:"#fff",border:"none",borderRadius:6,padding:"6px 14px",cursor:"pointer",fontWeight:700,fontSize:12}}>{saving?"Saving...":"Confirm Reject"}</button>
                        <button onClick={()=>{setRejectId(null);setRejectNote("");}} style={{background:"#f1f5f9",color:"#64748b",border:"none",borderRadius:6,padding:"6px 12px",cursor:"pointer",fontWeight:600,fontSize:12}}>Cancel</button>
                      </div>
                    </div>
                  )}
                  {canReview&&pc.status==="pending"&&!isRejecting&&(
                    <div style={{display:"flex",gap:8,marginTop:10}}>
                      <button onClick={()=>approve(pc)} disabled={saving} style={{background:"#16a34a",color:"#fff",border:"none",borderRadius:7,padding:"7px 18px",cursor:"pointer",fontWeight:700,fontSize:12}}>✅ Approve</button>
                      <button onClick={()=>setRejectId(pc.id)} style={{background:"#fee2e2",color:"#dc2626",border:"1px solid #fca5a5",borderRadius:7,padding:"7px 14px",cursor:"pointer",fontWeight:600,fontSize:12}}>❌ Reject</button>
                    </div>
                  )}
                </div>
              </div>
            );
            }catch(err){console.error("Card render error",err,pc);return null;}
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Buyer Master Modal ───────────────────────────────────────────────────────
function BuyerFormModal({buyer,onSave,onClose,saving}){
  const EMPTY={buyer_name:"",company_name:"",address:"",country:"",contact_person:"",email:"",phone:"",payment_terms:"",bank_name:"",bank_address:"",bank_account:"",swift_code:"",iban:"",notes:""};
  const [form,setForm]=useState(buyer?{...buyer}:{...EMPTY});
  const sf=(k,v)=>setForm(f=>({...f,[k]:v}));
  const fld=(k,l,t="text",opts=null)=>(
    <div key={k}>
      <label style={{fontSize:11.5,fontWeight:600,color:"#374151",display:"block",marginBottom:3}}>{l}</label>
      {opts?<select value={form[k]||""} onChange={e=>sf(k,e.target.value)} style={iS}><option value="">Select...</option>{opts.map(o=><option key={o}>{o}</option>)}</select>
      :t==="textarea"?<textarea value={form[k]||""} onChange={e=>sf(k,e.target.value)} rows={2} style={{...iS,resize:"vertical"}}/>
      :<input type={t} value={form[k]||""} onChange={e=>sf(k,e.target.value)} style={iS}/>}
    </div>
  );
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:12}}>
      <div style={{background:"#fff",borderRadius:14,padding:20,width:"100%",maxWidth:680,maxHeight:"95vh",overflow:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <h3 style={{margin:0,color:"#1e3a5f",fontSize:15}}>{buyer?"Edit":"Add"} Buyer</h3>
          <button onClick={onClose} style={{background:"#f1f5f9",border:"none",borderRadius:6,padding:"5px 12px",cursor:"pointer",fontWeight:600}}>✕</button>
        </div>
        <SH t="Company Details"/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
          {fld("buyer_name","Buyer / Trade Name *")}
          {fld("company_name","Full Company Name")}
          {fld("country","Country","select",COUNTRIES)}
          {fld("contact_person","Contact Person")}
          {fld("email","Email","email")}
          {fld("phone","Phone")}
        </div>
        <div style={{marginBottom:12}}>{fld("address","Full Address","textarea")}</div>
        <SH t="Payment & Banking"/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
          {fld("payment_terms","Default Payment Terms")}
          {fld("bank_name","Bank Name")}
          {fld("bank_account","Bank Account No")}
          {fld("swift_code","SWIFT Code")}
          {fld("iban","IBAN")}
          {fld("bank_address","Bank Address")}
        </div>
        <div style={{marginBottom:14}}>{fld("notes","Notes","textarea")}</div>
        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
          <button onClick={onClose} style={{background:"#f1f5f9",color:"#64748b",border:"none",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontWeight:600}}>Cancel</button>
          <button onClick={()=>onSave(form)} disabled={saving} style={{background:"linear-gradient(135deg,#1e3a5f,#16a34a)",color:"#fff",border:"none",borderRadius:8,padding:"8px 24px",cursor:"pointer",fontWeight:700}}>{saving?"Saving...":"Save Buyer"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Contract Form Modal ──────────────────────────────────────────────────────
function ContractFormModal({contract,buyers,userInfo,onSave,onClose,saving}){
  const today=new Date().toISOString().split("T")[0];
  const DEFAULT_DOCS=["commercial_invoice","packing_list","bill_of_lading","cert_of_origin","fumigation_cert","phyto_certificate","insurance","weight_quality","pesticide_report"];
  const EMPTY={
    contract_no:"",contract_date:today,seller_company:"devratan",
    buyer_id:"",buyer_name:"",buyer_address:"",
    consignee_id:"",consignee_name:"",consignee_address:"",
    commodity:"INDIAN PARBOILED RICE – 5% BROKEN",
    quantity_tolerance:"+/- 5% at seller's option",
    items:[{id:1,packing:"In 20 Kg PP Bags",quantity_mt:"",container_qty:"1",container_type:"20' FCL",price_usd:"",price_per:"MTs"}],
    loading_port:"Any Indian Port",destination:"",
    specification:"Moisture 14% Max, Broken 5% Max, DD 2% Max, Length 5.9 mm Min",
    shipment_period:"",delivery_terms:"CIF",
    payment_condition:"",
    selected_docs:DEFAULT_DOCS,
    war_risk_clause:true,
    other_doc_name:"",
    special_conditions:"",status:"draft"
  };
  const [form,setForm]=useState(()=>{
    if(contract){
      // Migrate old single-field contracts to items array
      let items = contract.items;
      if(!items || !items.length) {
        items = [{
          id:1,
          packing: contract.packing || "In 20 Kg PP Bags",
          quantity_mt: contract.quantity_mt || "",
          container_qty: contract.container_qty || "1",
          container_type: contract.container_type || "20' FCL",
          price_usd: contract.price_usd || "",
          price_per: contract.price_per || "MTs",
        }];
      }
      return{
        ...EMPTY,...contract,
        items,
        selected_docs:contract.selected_docs||DEFAULT_DOCS,
        war_risk_clause:contract.war_risk_clause!==undefined?contract.war_risk_clause:true,
        seller_company:contract.seller_company||"devratan",
      };
    }
    return{...EMPTY};
  });
  const sf=(k,v)=>setForm(f=>({...f,[k]:v}));

  const selectBuyer=(id)=>{
    const b=buyers.find(x=>x.id===id);
    if(!b){sf("buyer_id",id);return;}
    setForm(f=>({...f,buyer_id:id,buyer_name:b.buyer_name,buyer_address:b.address||"",payment_condition:b.payment_terms||f.payment_condition}));
  };
  const selectConsignee=(id)=>{
    const b=buyers.find(x=>x.id===id);
    if(!b){sf("consignee_id",id);return;}
    setForm(f=>({...f,consignee_id:id,consignee_name:b.buyer_name,consignee_address:b.address||""}));
  };
  const toggleDoc=(key)=>{
    const cur=form.selected_docs||[];
    sf("selected_docs",cur.includes(key)?cur.filter(k=>k!==key):[...cur,key]);
  };

  const fld=(k,l,t="text",opts=null,full=false)=>(
    <div key={k} style={full?{gridColumn:"1/-1"}:{}}>
      <label style={{fontSize:11.5,fontWeight:600,color:"#374151",display:"block",marginBottom:3}}>{l}</label>
      {opts?<select value={form[k]||""} onChange={e=>sf(k,e.target.value)} style={iS}><option value="">Select...</option>{opts.map(o=><option key={o}>{o}</option>)}</select>
      :t==="textarea"?<textarea value={form[k]||""} onChange={e=>sf(k,e.target.value)} rows={3} style={{...iS,resize:"vertical"}}/>
      :<input type={t} value={form[k]||""} onChange={e=>sf(k,e.target.value)} style={iS} step={t==="number"?"any":undefined}/>}
    </div>
  );

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:12}}>
      <div style={{background:"#fff",borderRadius:14,padding:20,width:"100%",maxWidth:820,maxHeight:"95vh",overflow:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <h3 style={{margin:0,color:"#1e3a5f",fontSize:15}}>{contract?"Edit":"Create"} Sales Contract</h3>
          <button onClick={onClose} style={{background:"#f1f5f9",border:"none",borderRadius:6,padding:"5px 12px",cursor:"pointer",fontWeight:600}}>✕</button>
        </div>

        <SH t="Seller Company"/>
        <div style={{marginBottom:12}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {Object.values(COMPANIES).map(co=>(
              <div key={co.id} onClick={()=>sf("seller_company",co.id)}
                style={{border:"2px solid "+(form.seller_company===co.id?"#1e3a5f":"#e2e8f0"),
                  borderRadius:8,padding:"10px 14px",cursor:"pointer",background:form.seller_company===co.id?"#eff6ff":"#fff",
                  transition:"all 0.15s"}}>
                <div style={{fontWeight:700,fontSize:12,color:"#1e3a5f"}}>{co.name}</div>
                <div style={{fontSize:10,color:"#64748b",marginTop:2}}>{co.address}</div>
                <div style={{fontSize:10,color:"#64748b"}}>{co.phone} · {co.email}</div>
                {form.seller_company===co.id&&<div style={{fontSize:10,color:"#1d4ed8",fontWeight:600,marginTop:4}}>✓ Selected</div>}
              </div>
            ))}
          </div>
        </div>

        <SH t="Contract Details"/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
          {fld("contract_no","Contract No *")}
          {fld("contract_date","Contract Date","date")}
        </div>

        <SH t="Buyer *"/>
        <div style={{marginBottom:10}}>
          <select value={form.buyer_id||""} onChange={e=>selectBuyer(e.target.value)} style={{...iS,borderColor:form.buyer_id?"#e2e8f0":"#dc2626",marginBottom:6}}>
            <option value="">Select Buyer from Master...</option>
            {buyers.map(b=><option key={b.id} value={b.id}>{b.buyer_name} — {b.country}</option>)}
          </select>
          {form.buyer_id&&<div style={{background:"#f0fdf4",borderRadius:6,padding:"6px 10px",fontSize:11,color:"#15803d"}}>
            ✅ {form.buyer_name} · {buyers.find(b=>b.id===form.buyer_id)?.country}
          </div>}
        </div>

        <SH t="Consignee (if different from Buyer)"/>
        <div style={{marginBottom:12}}>
          <select value={form.consignee_id||""} onChange={e=>selectConsignee(e.target.value)} style={{...iS,marginBottom:6}}>
            <option value="">Same as Buyer / Not Applicable</option>
            {buyers.map(b=><option key={b.id} value={b.id}>{b.buyer_name} — {b.country}</option>)}
          </select>
          {form.consignee_id&&<div style={{background:"#eff6ff",borderRadius:6,padding:"6px 10px",fontSize:11,color:"#1d4ed8"}}>
            ✅ Consignee: {form.consignee_name} · {buyers.find(b=>b.id===form.consignee_id)?.country}
          </div>}
        </div>

        <SH t="Commodity & Specification"/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
          <div style={{gridColumn:"1/-1"}}>{fld("commodity","Commodity (same for all items)")}</div>
          <div>
            <label style={{fontSize:11.5,fontWeight:600,color:"#374151",display:"block",marginBottom:3}}>Quantity Tolerance</label>
            <input value={form.quantity_tolerance||""} onChange={e=>sf("quantity_tolerance",e.target.value)} style={iS} placeholder="+/- 5% at seller's option"/>
          </div>
          <div>
            <label style={{fontSize:11.5,fontWeight:600,color:"#374151",display:"block",marginBottom:3}}>Delivery Terms</label>
            <select value={form.delivery_terms||""} onChange={e=>sf("delivery_terms",e.target.value)} style={iS}>
              {DEL_TERMS.map(o=><option key={o}>{o}</option>)}
            </select>
          </div>
          {fld("specification","Specification")}
          {fld("shipment_period","Shipment Period (e.g. JUN-JUL 2026)")}
          {fld("loading_port","Port of Loading")}
          {fld("destination","Destination Port")}
        </div>

        <SH t="Items (Packing × Qty × Price)"/>
        <div style={{marginBottom:12}}>
          {(form.items||[]).map((item,idx)=>{
            const updItem=(k,v)=>sf("items",(form.items||[]).map((it,i)=>i===idx?{...it,[k]:v}:it));
            const totalQty=n(item.quantity_mt);
            const totalVal=totalQty*n(item.price_usd);
            return(
              <div key={item.id||idx} style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:10,padding:12,marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <div style={{fontWeight:700,color:"#1e3a5f",fontSize:13}}>
                    Item #{idx+1}
                    {item.packing&&<span style={{fontWeight:400,color:"#64748b",fontSize:11,marginLeft:8}}>{item.packing}</span>}
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    {totalVal>0&&<span style={{fontSize:11,color:"#16a34a",fontWeight:600}}>≈ USD {(totalVal).toLocaleString("en-IN",{minimumFractionDigits:0,maximumFractionDigits:0})}</span>}
                    {(form.items||[]).length>1&&(
                      <button onClick={()=>sf("items",(form.items||[]).filter((_,i)=>i!==idx))}
                        style={{background:"#fee2e2",color:"#dc2626",border:"none",borderRadius:5,padding:"3px 9px",cursor:"pointer",fontSize:11}}>Remove</button>
                    )}
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  <div style={{gridColumn:"1/-1"}}>
                    <label style={{fontSize:11.5,fontWeight:600,color:"#374151",display:"block",marginBottom:3}}>Packing Type *</label>
                    <input value={item.packing||""} onChange={e=>updItem("packing",e.target.value)} style={iS} placeholder="e.g. In 20 Kg PP Bags"/>
                  </div>
                  <div>
                    <label style={{fontSize:11.5,fontWeight:600,color:"#374151",display:"block",marginBottom:3}}>Quantity (MT)</label>
                    <input type="number" value={item.quantity_mt||""} onChange={e=>updItem("quantity_mt",e.target.value)} style={iS} step="any" placeholder="e.g. 25"/>
                  </div>
                  <div>
                    <label style={{fontSize:11.5,fontWeight:600,color:"#374151",display:"block",marginBottom:3}}>No. of Containers</label>
                    <input type="number" value={item.container_qty||""} onChange={e=>updItem("container_qty",e.target.value)} style={iS} min="1"/>
                  </div>
                  <div>
                    <label style={{fontSize:11.5,fontWeight:600,color:"#374151",display:"block",marginBottom:3}}>Container Type</label>
                    <select value={item.container_type||""} onChange={e=>updItem("container_type",e.target.value)} style={iS}>
                      {CONTAINER_TYPES.map(o=><option key={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{fontSize:11.5,fontWeight:600,color:"#374151",display:"block",marginBottom:3}}>Price (USD)</label>
                    <input type="number" value={item.price_usd||""} onChange={e=>updItem("price_usd",e.target.value)} style={iS} step="any" placeholder="e.g. 420"/>
                  </div>
                  <div>
                    <label style={{fontSize:11.5,fontWeight:600,color:"#374151",display:"block",marginBottom:3}}>Per</label>
                    <select value={item.price_per||"MTs"} onChange={e=>updItem("price_per",e.target.value)} style={iS}>
                      {["MTs","MT","Container","Lot"].map(o=><option key={o}>{o}</option>)}
                    </select>
                  </div>
                </div>
                {item.quantity_mt&&item.container_qty&&item.container_type&&(
                  <div style={{marginTop:8,background:"#eff6ff",borderRadius:6,padding:"5px 10px",fontSize:11,color:"#1d4ed8"}}>
                    📦 {item.quantity_mt} MTS · {item.container_qty} x {item.container_type}
                    {item.price_usd?` · USD ${item.price_usd} per ${item.price_per||"MTs"}`:""} {form.delivery_terms||""}
                  </div>
                )}
              </div>
            );
          })}
          <button onClick={()=>sf("items",[...(form.items||[]),{id:Date.now(),packing:"",quantity_mt:"",container_qty:"1",container_type:"20' FCL",price_usd:"",price_per:"MTs"}])}
            style={{background:"linear-gradient(135deg,#eff6ff,#f0fdf4)",border:"2px dashed #bfdbfe",borderRadius:10,padding:"10px 0",width:"100%",cursor:"pointer",fontWeight:600,fontSize:13,color:"#1d4ed8"}}>
            + Add Item
          </button>
          {(form.items||[]).length>1&&(()=>{
            const totQty=(form.items||[]).reduce((s,it)=>s+n(it.quantity_mt),0);
            const totVal=(form.items||[]).reduce((s,it)=>s+n(it.quantity_mt)*n(it.price_usd),0);
            return(
              <div style={{marginTop:8,background:"#1e3a5f",borderRadius:8,padding:"10px 14px",display:"flex",gap:20}}>
                <div><div style={{fontSize:10,color:"#93c5fd"}}>Total Quantity</div><div style={{fontWeight:700,color:"#fff",fontSize:14}}>{totQty} MTS</div></div>
                <div><div style={{fontSize:10,color:"#93c5fd"}}>Total Value</div><div style={{fontWeight:700,color:"#86efac",fontSize:14}}>USD {totVal.toLocaleString("en-IN",{minimumFractionDigits:0,maximumFractionDigits:0})}</div></div>
                <div><div style={{fontSize:10,color:"#93c5fd"}}>Items</div><div style={{fontWeight:700,color:"#fff",fontSize:14}}>{(form.items||[]).length}</div></div>
              </div>
            );
          })()}
        </div>

        <SH t="Payment"/>
        <div style={{marginBottom:12}}>
          <div style={{gridColumn:"1/-1"}}>{fld("payment_condition","Payment Condition")}</div>
        </div>

        <SH t="Documents Required"/>
        <div style={{background:"#f8fafc",borderRadius:10,padding:12,marginBottom:12,border:"1px solid #e2e8f0"}}>
          <p style={{margin:"0 0 8px",fontSize:11.5,color:"#64748b"}}>Select documents to include in contract:</p>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
            {ALL_DOCS.map(doc=>{
              const checked=(form.selected_docs||[]).includes(doc.key);
              return(
                <label key={doc.key} style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",background:checked?"#dcfce7":"#fff",border:`1px solid ${checked?"#86efac":"#e2e8f0"}`,borderRadius:7,padding:"7px 10px",fontSize:12,fontWeight:checked?600:400,transition:"all 0.15s"}}>
                  <input type="checkbox" checked={checked} onChange={()=>toggleDoc(doc.key)} style={{cursor:"pointer"}}/>
                  {doc.label}
                </label>
              );
            })}
          </div>
        </div>
        {(form.selected_docs||[]).includes("other_document")&&(
          <div style={{marginTop:8,background:"#eff6ff",borderRadius:8,padding:"8px 12px",border:"1px solid #bfdbfe"}}>
            <label style={{fontSize:11.5,fontWeight:600,color:"#1d4ed8",display:"block",marginBottom:4}}>Other Document Name:</label>
            <input value={form.other_doc_name||""} onChange={e=>sf("other_doc_name",e.target.value)} placeholder="e.g. Certificate of Analysis – 1 Original" style={{...iS,borderColor:"#bfdbfe"}}/>
          </div>
        )}

        <SH t="War Risk Clause"/>
        <div style={{background:"#fef3c7",borderRadius:10,padding:12,marginBottom:12,border:"1px solid #fbbf24"}}>
          <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer"}}>
            <input type="checkbox" checked={form.war_risk_clause!==false} onChange={e=>sf("war_risk_clause",e.target.checked)} style={{cursor:"pointer",width:16,height:16}}/>
            <div>
              <div style={{fontSize:12,fontWeight:700,color:"#92400e"}}>Include War Risk & Extraordinary Charges Clause</div>
              <div style={{fontSize:11,color:"#a16207",marginTop:2}}>Any additional charges due to war, hostilities, geopolitical tensions shall be borne by the Buyer.</div>
            </div>
          </label>
        </div>

        <SH t="Special Conditions (Optional)"/>
        <div style={{marginBottom:12}}>
          <textarea value={form.special_conditions||""} onChange={e=>sf("special_conditions",e.target.value)} rows={3} style={{...iS,resize:"vertical"}} placeholder="Any additional conditions specific to this contract..."/>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:10,alignItems:"center",marginBottom:14}}>
          <div>
            <label style={{fontSize:11.5,fontWeight:600,color:"#374151",display:"block",marginBottom:3}}>Status</label>
            <select value={form.status||"draft"} onChange={e=>sf("status",e.target.value)} style={iS}>
              <option value="draft">Draft</option>
              <option value="final">Final</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          {(userInfo?.role==="junior_accountant")&&(
            <div style={{background:"#fef3c7",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#92400e",fontWeight:600}}>
              ⚠️ Will need approval
            </div>
          )}
        </div>

        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
          <button onClick={onClose} style={{background:"#f1f5f9",color:"#64748b",border:"none",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontWeight:600}}>Cancel</button>
          <button onClick={()=>onSave(form)} disabled={saving} style={{background:"linear-gradient(135deg,#1e3a5f,#16a34a)",color:"#fff",border:"none",borderRadius:8,padding:"8px 24px",cursor:"pointer",fontWeight:700}}>{saving?"Saving...":"Save Contract"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Contract PDF Export ──────────────────────────────────────────────────────
// SVG logo as base64 — will be set once logo is uploaded
const LOGO_B64 = "data:image/png;base64,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";
const WATERMARK_B64 = "data:image/png;base64,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";


// ─── Proforma Invoice Modal ────────────────────────────────────────────────────
function ProformaInvoiceModal({contract, buyer, onClose, onSave}) {
  const today = new Date();
  const defaultValidity = new Date(today);
  defaultValidity.setDate(today.getDate() + 15);
  const fmt = d => d.toISOString().split("T")[0];

  const [piNo, setPiNo] = useState(
    contract.pi_no ||
    "PI-" + (contract.contract_no || "").replace(/[^A-Z0-9]/gi,"") + "-" +
    String(today.getFullYear()).slice(2) + String(today.getMonth()+1).padStart(2,"0")
  );
  const [validityDate, setValidityDate] = useState(contract.pi_validity || fmt(defaultValidity));
  const [advancePct, setAdvancePct] = useState(contract.pi_advance_pct != null ? String(contract.pi_advance_pct) : "");

  const seller = COMPANIES[(contract.seller_company||"devratan")] || COMPANIES.devratan;
  const bank   = BANK_DETAILS[(contract.seller_company||"devratan")] || BANK_DETAILS.devratan;

  const items = (contract.items && contract.items.length)
    ? contract.items
    : [{packing:contract.packing||"", quantity_mt:contract.quantity_mt||"",
        container_qty:contract.container_qty||"", container_type:contract.container_type||"",
        price_usd:contract.price_usd||"", price_per:contract.price_per||"MTs"}];
  const totQty = items.reduce((s,it)=>s+n(it.quantity_mt),0);
  const totVal = items.reduce((s,it)=>s+n(it.quantity_mt)*n(it.price_usd),0);
  const advAmt = advancePct ? (totVal * Number(advancePct) / 100) : 0;

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:400,padding:12,overflowY:"auto"}}>
      <div style={{background:"#fff",borderRadius:14,padding:22,width:"100%",maxWidth:500,boxShadow:"0 20px 60px rgba(0,0,0,0.3)",margin:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div>
            <h3 style={{margin:"0 0 2px",color:"#1e3a5f",fontSize:15}}>🧾 Generate Proforma Invoice</h3>
            <p style={{margin:0,fontSize:11,color:"#64748b"}}>Contract: {contract.contract_no} · {contract.buyer_name}</p>
          </div>
          <button onClick={onClose} style={{background:"#f1f5f9",border:"none",borderRadius:6,padding:"5px 12px",cursor:"pointer",fontWeight:600}}>✕</button>
        </div>

        {/* Summary */}
        <div style={{background:"#f8fafc",borderRadius:10,padding:12,marginBottom:14,border:"1px solid #e2e8f0"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,fontSize:12}}>
            <div><span style={{color:"#94a3b8",fontSize:11}}>Commodity</span><div style={{fontWeight:600,color:"#1e3a5f"}}>{contract.commodity}</div></div>
            <div><span style={{color:"#94a3b8",fontSize:11}}>Seller</span><div style={{fontWeight:600,color:"#1e3a5f",fontSize:11}}>{seller.name}</div></div>
            <div><span style={{color:"#94a3b8",fontSize:11}}>Total Qty</span><div style={{fontWeight:700,color:"#1e3a5f"}}>{totQty} MTS</div></div>
            <div><span style={{color:"#94a3b8",fontSize:11}}>Total Value</span><div style={{fontWeight:700,color:"#16a34a"}}>USD {totVal.toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2})}</div></div>
          </div>
        </div>

        {/* PI Number */}
        <div style={{marginBottom:12}}>
          <label style={{fontSize:11.5,fontWeight:600,color:"#374151",display:"block",marginBottom:4}}>Proforma Invoice Number *</label>
          <input value={piNo} onChange={e=>setPiNo(e.target.value)} style={{...iS,fontSize:13,fontWeight:600}} placeholder="e.g. PI-2627-001"/>
        </div>

        {/* Validity Date */}
        <div style={{marginBottom:12}}>
          <label style={{fontSize:11.5,fontWeight:600,color:"#374151",display:"block",marginBottom:4}}>Valid Till Date</label>
          <input type="date" value={validityDate} onChange={e=>setValidityDate(e.target.value)} style={iS}/>
        </div>

        {/* Advance % */}
        <div style={{marginBottom:14}}>
          <label style={{fontSize:11.5,fontWeight:600,color:"#374151",display:"block",marginBottom:4}}>Advance Payment Required (%)</label>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <input type="number" value={advancePct} onChange={e=>setAdvancePct(e.target.value)} style={{...iS,width:100}} min="0" max="100" placeholder="e.g. 30"/>
            {advancePct&&<div style={{fontSize:12,color:"#16a34a",fontWeight:600}}>= USD {advAmt.toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2})}</div>}
          </div>
          <div style={{fontSize:10,color:"#94a3b8",marginTop:3}}>Leave blank if not applicable</div>
        </div>

        {/* Bank preview */}
        <div style={{background:"#eff6ff",borderRadius:8,padding:"10px 12px",marginBottom:16,fontSize:11}}>
          <div style={{fontWeight:700,color:"#1d4ed8",marginBottom:4}}>🏦 {bank.bankName} — {bank.branch}</div>
          <div style={{color:"#1e40af"}}>A/c: {bank.accNo} · SWIFT: {bank.swift}{bank.iban?" · IBAN: "+bank.iban:""}</div>
        </div>

        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
          <button onClick={onClose} style={{background:"#f1f5f9",color:"#64748b",border:"none",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontWeight:600}}>Cancel</button>
          <button
            onClick={()=>{
              exportProformaInvoicePDF(contract, buyer, piNo, validityDate, advancePct ? Number(advancePct) : null);
              if (onSave) onSave({ pi_no: piNo, pi_validity: validityDate, pi_advance_pct: advancePct ? Number(advancePct) : null });
              onClose();
            }}
            disabled={!piNo.trim()}
            style={{background:"linear-gradient(135deg,#92400e,#d97706)",color:"#fff",border:"none",borderRadius:8,padding:"8px 22px",cursor:"pointer",fontWeight:700,fontSize:13,opacity:piNo.trim()?1:0.5}}
          >
            📄 PDF
          </button>
          <button
            onClick={()=>{
              exportProformaInvoiceWord(contract, buyer, piNo, validityDate, advancePct ? Number(advancePct) : null)
                .then(()=>{
                  if (onSave) onSave({ pi_no: piNo, pi_validity: validityDate, pi_advance_pct: advancePct ? Number(advancePct) : null });
                  onClose();
                })
                .catch(e=>{alert("Word export failed: "+e.message);console.error(e);});
            }}
            disabled={!piNo.trim()}
            style={{background:"linear-gradient(135deg,#1e3a5f,#2563eb)",color:"#fff",border:"none",borderRadius:8,padding:"8px 22px",cursor:"pointer",fontWeight:700,fontSize:13,opacity:piNo.trim()?1:0.5}}
          >
            📝 Word
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Bank Details for Proforma Invoice ────────────────────────────────────────
const BANK_DETAILS = {
  devratan: {
    bankName: "STATE BANK OF INDIA",
    branch:   "IFB Branch, Indore",
    accNo:    "41289547389",
    swift:    "SBININBB711",
    currency: "USD",
  },
  vjra: {
    bankName: "WIO BANK",
    branch:   "Etihad Airways Center, Abu Dhabi, UAE",
    accNo:    "9601473158",
    iban:     "AE720860000009601473158",
    swift:    "WIOBAEADXXX",
    currency: "USD",
  },
};

// ─── Word Export — Contract ────────────────────────────────────────────────────
async function exportContractWord(contract, buyer, consignee) {
  const docx = getDocx();
  if (!docx) return;
  const {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    AlignmentType, WidthType, BorderStyle, ShadingType, VerticalAlign,
    Header, Footer, PageNumber
  } = docx;

  const seller = COMPANIES[(contract.seller_company||"devratan")] || COMPANIES.devratan;
  const items  = (contract.items && contract.items.length)
    ? contract.items
    : [{packing:contract.packing||"", quantity_mt:contract.quantity_mt||"",
        container_qty:contract.container_qty||"", container_type:contract.container_type||"",
        price_usd:contract.price_usd||"", price_per:contract.price_per||"MTs"}];
  const totQty = items.reduce((s,it)=>s+n(it.quantity_mt),0);
  const totVal = items.reduce((s,it)=>s+n(it.quantity_mt)*n(it.price_usd),0);
  const fmt2   = v => Number(v).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});

  // Colours (hex)
  const NAVY  = "123458";
  const STEEL = "4682B4";
  const LGRAY = "EBF3FC";
  const GOLD  = "A27832";
  const WHITE = "FFFFFF";
  const GREEN = "155C33";

  const TW = 9360; // content width in DXA (A4 with 18mm margins each side ≈ 9360)
  const border = (c) => ({ style: BorderStyle.SINGLE, size: 4, color: c || "CCCCCC" });
  const allBorders = (c) => ({ top:border(c), bottom:border(c), left:border(c), right:border(c) });
  const noBorders  = () => {
    const nb = { style: BorderStyle.NIL, size: 0, color: "FFFFFF" };
    return { top:nb, bottom:nb, left:nb, right:nb };
  };

  const hdrCell = (txt, w, options={}) => new TableCell({
    width: { size:w, type:WidthType.DXA },
    shading: { fill:NAVY, type:ShadingType.CLEAR },
    borders: allBorders("FFFFFF"),
    margins: { top:80, bottom:80, left:140, right:140 },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      alignment: options.align || AlignmentType.LEFT,
      children: [new TextRun({ text:txt, bold:true, color:WHITE, size:18, font:"Arial" })]
    })]
  });

  const labelCell = (txt, w) => new TableCell({
    width: { size:w, type:WidthType.DXA },
    shading: { fill:LGRAY, type:ShadingType.CLEAR },
    borders: allBorders("D0DCE8"),
    margins: { top:80, bottom:80, left:140, right:140 },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({ children: [new TextRun({ text:txt, bold:true, color:NAVY, size:18, font:"Arial" })] })]
  });

  const valueCell = (txt, w, options={}) => new TableCell({
    width: { size:w, type:WidthType.DXA },
    shading: { fill:options.fill||WHITE, type:ShadingType.CLEAR },
    borders: allBorders("D0DCE8"),
    margins: { top:80, bottom:80, left:140, right:140 },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      alignment: options.align || AlignmentType.LEFT,
      children: [new TextRun({ text:String(txt||""), bold:!!options.bold, color:options.color||"111111", size:18, font:"Arial" })]
    })]
  });

  // Title block
  const titleBlock = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before:0, after:80 },
      children: [new TextRun({ text:seller.name, bold:true, size:26, color:NAVY, font:"Arial" })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before:0, after:40 },
      children: [new TextRun({ text:seller.address, size:16, color:"444444", font:"Arial" })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before:0, after:200 },
      children: [new TextRun({ text:(seller.phone||"")+(seller.email?"   |   "+seller.email:"")+(seller.gstin?"   |   "+seller.gstin:""), size:15, color:STEEL, font:"Arial" })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before:0, after:60 },
      border: { bottom:{ style:BorderStyle.SINGLE, size:8, color:GOLD } },
      children: [new TextRun({ text:"SALE CONTRACT", bold:true, size:32, color:NAVY, font:"Arial" })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before:60, after:200 },
      children: [
        new TextRun({ text:"Contract No: ", size:18, font:"Arial", color:"444444" }),
        new TextRun({ text:contract.contract_no||"", bold:true, size:18, font:"Arial", color:NAVY }),
        new TextRun({ text:"     Date: ", size:18, font:"Arial", color:"444444" }),
        new TextRun({ text:contract.contract_date||"", bold:true, size:18, font:"Arial", color:NAVY }),
      ]
    }),
  ];

  // Parties table
  const buyerAddr = contract.buyer_address || buyer?.address || "";
  const consigneeAddr = consignee?.address || "";
  const partiesTable = new Table({
    width: { size:TW, type:WidthType.DXA },
    columnWidths: [1400, 2800, TW-4200],
    rows: [
      new TableRow({ children: [
        hdrCell("SELLER", 1400, {align:AlignmentType.CENTER}),
        new TableCell({
          width:{size:2800,type:WidthType.DXA}, columnSpan:2,
          shading:{fill:"EFF6FF",type:ShadingType.CLEAR}, borders:allBorders("D0DCE8"),
          margins:{top:80,bottom:80,left:140,right:140},
          children:[
            new Paragraph({children:[new TextRun({text:seller.name, bold:true, size:19, color:NAVY, font:"Arial"})]}),
            new Paragraph({children:[new TextRun({text:seller.address, size:17, color:"444444", font:"Arial"})]}),
          ]
        }),
      ]}),
      new TableRow({ children: [
        hdrCell("BUYER", 1400, {align:AlignmentType.CENTER}),
        new TableCell({
          width:{size:2800,type:WidthType.DXA},
          shading:{fill:"EFF6FF",type:ShadingType.CLEAR}, borders:allBorders("D0DCE8"),
          margins:{top:80,bottom:80,left:140,right:140},
          children:[new Paragraph({children:[new TextRun({text:contract.buyer_name||"", bold:true, size:19, color:NAVY, font:"Arial"})]})]
        }),
        new TableCell({
          width:{size:TW-4200,type:WidthType.DXA},
          shading:{fill:"EFF6FF",type:ShadingType.CLEAR}, borders:allBorders("D0DCE8"),
          margins:{top:80,bottom:80,left:140,right:140},
          children:[new Paragraph({children:[new TextRun({text:buyerAddr, size:17, color:"444444", font:"Arial"})]})]
        }),
      ]}),
      ...(consignee ? [new TableRow({ children: [
        hdrCell("CONSIGNEE", 1400, {align:AlignmentType.CENTER}),
        new TableCell({
          width:{size:2800,type:WidthType.DXA},
          shading:{fill:"EFF6FF",type:ShadingType.CLEAR}, borders:allBorders("D0DCE8"),
          margins:{top:80,bottom:80,left:140,right:140},
          children:[new Paragraph({children:[new TextRun({text:consignee.name||"", bold:true, size:19, color:NAVY, font:"Arial"})]})]
        }),
        new TableCell({
          width:{size:TW-4200,type:WidthType.DXA},
          shading:{fill:"EFF6FF",type:ShadingType.CLEAR}, borders:allBorders("D0DCE8"),
          margins:{top:80,bottom:80,left:140,right:140},
          children:[new Paragraph({children:[new TextRun({text:consigneeAddr, size:17, color:"444444", font:"Arial"})]})]
        }),
      ]})] : []),
    ]
  });

  // Terms table
  const termRow = (label, value, bold) => new TableRow({ children: [
    labelCell(label, 2200),
    valueCell(value, TW-2200, {bold:!!bold}),
  ]});

  // Items rows
  const itemRows = items.map((it, i) => {
    const qty   = n(it.quantity_mt);
    const price = n(it.price_usd);
    const amt   = qty * price;
    return new TableRow({ children: [
      valueCell(String(i+1), 600, {align:AlignmentType.CENTER}),
      valueCell(contract.commodity||"", 2600),
      valueCell(it.packing||"", 1700),
      valueCell(qty ? fmt2(qty)+" MTS" : "", 1200, {align:AlignmentType.RIGHT}),
      valueCell(it.container_qty&&it.container_type ? it.container_qty+" x "+it.container_type : "", 1400, {align:AlignmentType.CENTER}),
      valueCell(price ? "USD "+fmt2(price) : "", 1400, {align:AlignmentType.RIGHT}),
      valueCell(amt ? "USD "+fmt2(amt) : "", TW-8900, {align:AlignmentType.RIGHT, bold:true, color:GREEN}),
    ]});
  });

  const itemsTotalRow = new TableRow({ children: [
    new TableCell({width:{size:600,type:WidthType.DXA}, shading:{fill:LGRAY,type:ShadingType.CLEAR}, borders:allBorders("D0DCE8"), margins:{top:80,bottom:80,left:140,right:140}, children:[new Paragraph({children:[new TextRun({text:"",size:18,font:"Arial"})]})]}),
    new TableCell({width:{size:2600,type:WidthType.DXA}, shading:{fill:LGRAY,type:ShadingType.CLEAR}, borders:allBorders("D0DCE8"), margins:{top:80,bottom:80,left:140,right:140}, children:[new Paragraph({children:[new TextRun({text:"TOTAL",bold:true,color:NAVY,size:18,font:"Arial"})]})]}),
    new TableCell({columnSpan:3, width:{size:4300,type:WidthType.DXA}, shading:{fill:LGRAY,type:ShadingType.CLEAR}, borders:allBorders("D0DCE8"), margins:{top:80,bottom:80,left:140,right:140}, children:[new Paragraph({children:[new TextRun({text:contract.quantity_tolerance||"+/- 5% at seller's option", size:17, color:"555555", font:"Arial"})]})]}),
    new TableCell({width:{size:1400,type:WidthType.DXA}, shading:{fill:LGRAY,type:ShadingType.CLEAR}, borders:allBorders("D0DCE8"), margins:{top:80,bottom:80,left:140,right:140}, children:[new Paragraph({children:[new TextRun({text:"",size:18,font:"Arial"})]})]}),
    new TableCell({width:{size:TW-8900,type:WidthType.DXA}, shading:{fill:GOLD,type:ShadingType.CLEAR}, borders:allBorders(GOLD), margins:{top:80,bottom:80,left:140,right:140}, children:[new Paragraph({alignment:AlignmentType.RIGHT, children:[new TextRun({text:"USD "+fmt2(totVal),bold:true,color:WHITE,size:18,font:"Arial"})]})]}),
  ]});

  const itemsTable = new Table({
    width: { size:TW, type:WidthType.DXA },
    columnWidths: [600, 2600, 1700, 1200, 1400, 1400, TW-8900],
    rows: [
      new TableRow({ tableHeader:true, children: [
        hdrCell("#", 600, {align:AlignmentType.CENTER}),
        hdrCell("Description", 2600),
        hdrCell("Packing", 1700),
        hdrCell("Qty (MTS)", 1200, {align:AlignmentType.RIGHT}),
        hdrCell("Containers", 1400, {align:AlignmentType.CENTER}),
        hdrCell("Unit Price (USD)", 1400, {align:AlignmentType.RIGHT}),
        hdrCell("Amount (USD)", TW-8900, {align:AlignmentType.RIGHT}),
      ]}),
      ...itemRows,
      itemsTotalRow,
    ]
  });

  // Selected docs text
  const selectedDocs = Array.isArray(contract.selected_docs) ? contract.selected_docs : [];
  const docsText = ALL_DOCS.filter(d=>selectedDocs.includes(d.key)).map(d=>d.label).join(", ") || "As per contract";

  const termsTable = new Table({
    width: { size:TW, type:WidthType.DXA },
    columnWidths: [2200, TW-2200],
    rows: [
      termRow("Commodity",      contract.commodity||"", true),
      termRow("Loading Port",   contract.loading_port||""),
      termRow("Destination",    contract.destination||""),
      termRow("Specification",  contract.specification||""),
      termRow("Shipment",       contract.shipment_period||""),
      termRow("Delivery Terms", contract.delivery_terms||""),
      termRow("Payment Terms",  contract.payment_condition||"", true),
      termRow("Documents",      docsText),
      ...(contract.special_conditions ? [termRow("Special Conditions", contract.special_conditions)] : []),
    ]
  });

  // Signature row
  const sigTable = new Table({
    width: { size:TW, type:WidthType.DXA },
    columnWidths: [TW/2, TW/2],
    rows: [
      new TableRow({ children: [
        new TableCell({
          width:{size:TW/2,type:WidthType.DXA},
          borders:noBorders(),
          margins:{top:200,bottom:200,left:0,right:200},
          children:[
            new Paragraph({children:[new TextRun({text:"For Buyer:", bold:true, size:18, color:NAVY, font:"Arial"})]}),
            new Paragraph({spacing:{before:600}, children:[new TextRun({text:contract.buyer_name||"", size:17, color:"444444", font:"Arial"})]}),
            new Paragraph({children:[new TextRun({text:"Authorized Signatory", size:16, color:"888888", font:"Arial"})]}),
          ]
        }),
        new TableCell({
          width:{size:TW/2,type:WidthType.DXA},
          borders:noBorders(),
          margins:{top:200,bottom:200,left:200,right:0},
          children:[
            new Paragraph({children:[new TextRun({text:"For "+seller.name+":", bold:true, size:18, color:NAVY, font:"Arial"})]}),
            new Paragraph({spacing:{before:600}, children:[new TextRun({text:"", size:17, font:"Arial"})]}),
            new Paragraph({children:[new TextRun({text:"Authorized Signatory", size:16, color:"888888", font:"Arial"})]}),
          ]
        }),
      ]})
    ]
  });

  const spacer = new Paragraph({ spacing:{ before:240, after:240 }, children:[new TextRun("")] });
  const sectionHdr = (txt) => new Paragraph({
    spacing:{ before:280, after:120 },
    border:{ bottom:{ style:BorderStyle.SINGLE, size:6, color:GOLD } },
    children:[new TextRun({ text:txt, bold:true, size:20, color:NAVY, font:"Arial" })]
  });

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          size: { width:11906, height:16838 },
          margin: { top:1080, right:1080, bottom:1080, left:1080 }
        }
      },
      headers: {
        default: new Header({ children:[
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children:[new TextRun({ text:seller.name+"  |  SALE CONTRACT  |  "+( contract.contract_no||""), size:15, color:STEEL, font:"Arial" })]
          })
        ]})
      },
      footers: {
        default: new Footer({ children:[
          new Paragraph({
            alignment: AlignmentType.CENTER,
            border: { top:{ style:BorderStyle.SINGLE, size:4, color:NAVY } },
            children:[
              new TextRun({ text:seller.address, size:15, color:"555555", font:"Arial" }),
              new TextRun({ text:"    |    Page ", size:15, color:"555555", font:"Arial" }),
              new TextRun({ children:[PageNumber.CURRENT], size:15, color:NAVY, font:"Arial" }),
            ]
          })
        ]})
      },
      children: [
        ...titleBlock,
        spacer,
        sectionHdr("Parties"),
        partiesTable,
        spacer,
        sectionHdr("Contract Items"),
        itemsTable,
        spacer,
        sectionHdr("Terms & Conditions"),
        termsTable,
        spacer,
        sectionHdr("War Risk & Extraordinary Charges"),
        new Paragraph({
          spacing:{ before:80, after:80 },
          children:[new TextRun({
            text: contract.war_risk_clause
              ? "Include War Risk & Extraordinary Charges Clause: Any additional charges due to war, hostilities, geopolitical tensions shall be borne by the Buyer."
              : "War Risk & Extraordinary Charges Clause: Not applicable.",
            size:17, font:"Arial", color:"333333"
          })]
        }),
        spacer,
        sectionHdr("Signatures"),
        sigTable,
      ]
    }]
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "Contract_"+(contract.contract_no||"draft")+".docx";
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

// ─── Word Export — Proforma Invoice ───────────────────────────────────────────
async function exportProformaInvoiceWord(contract, buyer, piNo, validityDate, advancePct) {
  const docx = getDocx();
  if (!docx) return;
  const {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    AlignmentType, WidthType, BorderStyle, ShadingType, VerticalAlign,
    Header, Footer, PageNumber
  } = docx;

  const seller = COMPANIES[(contract.seller_company||"devratan")] || COMPANIES.devratan;
  const bank   = BANK_DETAILS[(contract.seller_company||"devratan")] || BANK_DETAILS.devratan;
  const items  = (contract.items && contract.items.length)
    ? contract.items
    : [{packing:contract.packing||"", quantity_mt:contract.quantity_mt||"",
        container_qty:contract.container_qty||"", container_type:contract.container_type||"",
        price_usd:contract.price_usd||"", price_per:contract.price_per||"MTs"}];
  const totQty = items.reduce((s,it)=>s+n(it.quantity_mt),0);
  const totVal = items.reduce((s,it)=>s+n(it.quantity_mt)*n(it.price_usd),0);
  const advAmt = advancePct ? (totVal * advancePct / 100) : 0;
  const fmt2   = v => Number(v).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
  const usd    = v => "USD "+fmt2(v);

  const NAVY  = "123458";
  const STEEL = "4682B4";
  const LGRAY = "EBF3FC";
  const GOLD  = "A27832";
  const WHITE = "FFFFFF";
  const GREEN = "155C33";
  const AMBER = "923E0E";
  const CREAM = "FFF8DC";

  const TW = 9360;
  const border = (c) => ({ style:BorderStyle.SINGLE, size:4, color:c||"CCCCCC" });
  const allBorders = (c) => ({ top:border(c), bottom:border(c), left:border(c), right:border(c) });
  const noBorders  = () => { const nb={style:BorderStyle.NIL,size:0,color:"FFFFFF"}; return {top:nb,bottom:nb,left:nb,right:nb}; };

  const hdrCell = (txt, w, align) => new TableCell({
    width:{size:w,type:WidthType.DXA}, shading:{fill:NAVY,type:ShadingType.CLEAR},
    borders:allBorders("FFFFFF"), margins:{top:80,bottom:80,left:140,right:140}, verticalAlign:VerticalAlign.CENTER,
    children:[new Paragraph({alignment:align||AlignmentType.LEFT, children:[new TextRun({text:txt,bold:true,color:WHITE,size:18,font:"Arial"})]})]
  });
  const lCell = (txt, w) => new TableCell({
    width:{size:w,type:WidthType.DXA}, shading:{fill:LGRAY,type:ShadingType.CLEAR},
    borders:allBorders("D0DCE8"), margins:{top:80,bottom:80,left:140,right:140}, verticalAlign:VerticalAlign.CENTER,
    children:[new Paragraph({children:[new TextRun({text:txt,bold:true,color:NAVY,size:18,font:"Arial"})]})]
  });
  const vCell = (txt, w, opts={}) => new TableCell({
    width:{size:w,type:WidthType.DXA}, shading:{fill:opts.fill||WHITE,type:ShadingType.CLEAR},
    borders:allBorders("D0DCE8"), margins:{top:80,bottom:80,left:140,right:140}, verticalAlign:VerticalAlign.CENTER,
    children:[new Paragraph({alignment:opts.align||AlignmentType.LEFT, children:[new TextRun({text:String(txt||""),bold:!!opts.bold,color:opts.color||"111111",size:18,font:"Arial"})]})]
  });

  // Title
  const titleBlock = [
    new Paragraph({alignment:AlignmentType.CENTER, spacing:{before:0,after:80},
      children:[new TextRun({text:seller.name, bold:true, size:26, color:NAVY, font:"Arial"})]}),
    new Paragraph({alignment:AlignmentType.CENTER, spacing:{before:0,after:200},
      children:[new TextRun({text:seller.address, size:16, color:"444444", font:"Arial"})]}),
    new Paragraph({alignment:AlignmentType.CENTER, spacing:{before:0,after:60},
      border:{bottom:{style:BorderStyle.SINGLE,size:8,color:GOLD}},
      children:[new TextRun({text:"PROFORMA INVOICE", bold:true, size:32, color:NAVY, font:"Arial"})]}),
    new Paragraph({alignment:AlignmentType.CENTER, spacing:{before:80,after:200},
      children:[
        new TextRun({text:"PI No: ", size:18, font:"Arial", color:"444444"}),
        new TextRun({text:piNo||"---", bold:true, size:18, font:"Arial", color:NAVY}),
        new TextRun({text:"     Date: ", size:18, font:"Arial", color:"444444"}),
        new TextRun({text:contract.contract_date||"", bold:true, size:18, font:"Arial", color:NAVY}),
        new TextRun({text:"     Valid Till: ", size:18, font:"Arial", color:"444444"}),
        new TextRun({text:validityDate||"", bold:true, size:18, font:"Arial", color:AMBER}),
      ]
    }),
  ];

  // Parties
  const buyerAddr = contract.buyer_address || buyer?.address || "";
  const partiesTable = new Table({
    width:{size:TW,type:WidthType.DXA}, columnWidths:[1200,2800,TW-4000],
    rows:[
      new TableRow({children:[
        hdrCell("SELLER",1200,AlignmentType.CENTER),
        vCell(seller.name, 2800, {bold:true,color:NAVY,fill:"EFF6FF"}),
        vCell(seller.address, TW-4000, {fill:"EFF6FF",color:"444444"}),
      ]}),
      new TableRow({children:[
        hdrCell("BUYER",1200,AlignmentType.CENTER),
        vCell(contract.buyer_name||"", 2800, {bold:true,color:NAVY,fill:"EFF6FF"}),
        vCell(buyerAddr, TW-4000, {fill:"EFF6FF",color:"444444"}),
      ]}),
    ]
  });

  // Items
  const COL = [600, 2400, 1600, 1100, 1400, 1330, TW - 8430];
  const dataRows = items.map((it,i)=>{
    const qty=n(it.quantity_mt), price=n(it.price_usd), amt=qty*price;
    return new TableRow({children:[
      vCell(String(i+1),COL[0],{align:AlignmentType.CENTER}),
      vCell(contract.commodity||"",COL[1]),
      vCell(it.packing||"",COL[2]),
      vCell(qty?fmt2(qty):"",COL[3],{align:AlignmentType.RIGHT,bold:true}),
      vCell(it.container_qty&&it.container_type?it.container_qty+" x "+it.container_type:"",COL[4],{align:AlignmentType.CENTER}),
      vCell(price?fmt2(price):"",COL[5],{align:AlignmentType.RIGHT}),
      vCell(amt?fmt2(amt):"",COL[6],{align:AlignmentType.RIGHT,bold:true,color:GREEN}),
    ]});
  });

  // Total row
  const mkCell = (txt,w,opts={}) => new TableCell({
    width:{size:w,type:WidthType.DXA}, shading:{fill:opts.fill||LGRAY,type:ShadingType.CLEAR},
    borders:allBorders("D0DCE8"), margins:{top:80,bottom:80,left:140,right:140}, verticalAlign:VerticalAlign.CENTER,
    children:[new Paragraph({alignment:opts.align||AlignmentType.LEFT, children:[new TextRun({text:String(txt||""),bold:!!opts.bold,color:opts.color||NAVY,size:18,font:"Arial"})]})]
  });
  const totalRow = new TableRow({children:[
    mkCell("",COL[0]), mkCell("TOTAL",COL[1],{bold:true}),
    mkCell("",COL[2]), mkCell(fmt2(totQty),COL[3],{align:AlignmentType.RIGHT,bold:true}),
    mkCell("",COL[4]), mkCell("",COL[5]),
    mkCell(usd(totVal),COL[6],{fill:GOLD,color:WHITE,bold:true,align:AlignmentType.RIGHT}),
  ]});

  const advRow = advancePct ? new TableRow({children:[
    mkCell("",COL[0],{fill:CREAM}), mkCell("Advance ("+advancePct+"%) Due",COL[1],{bold:true,color:AMBER,fill:CREAM}),
    mkCell("",COL[2],{fill:CREAM}), mkCell("",COL[3],{fill:CREAM}),
    mkCell("",COL[4],{fill:CREAM}), mkCell("",COL[5],{fill:CREAM}),
    mkCell(usd(advAmt),COL[6],{fill:CREAM,color:AMBER,bold:true,align:AlignmentType.RIGHT}),
  ]}) : null;

  const itemsTable = new Table({
    width:{size:TW,type:WidthType.DXA}, columnWidths:COL,
    rows:[
      new TableRow({tableHeader:true, children:[
        hdrCell("#",COL[0],AlignmentType.CENTER),
        hdrCell("Description",COL[1]),
        hdrCell("Packing",COL[2]),
        hdrCell("Qty (MTS)",COL[3],AlignmentType.RIGHT),
        hdrCell("Containers",COL[4],AlignmentType.CENTER),
        hdrCell("Unit Price (USD)",COL[5],AlignmentType.RIGHT),
        hdrCell("Amount (USD)",COL[6],AlignmentType.RIGHT),
      ]}),
      ...dataRows,
      totalRow,
      ...(advRow ? [advRow] : []),
    ]
  });

  // Terms
  const termRow = (label, value, bold) => new TableRow({children:[
    lCell(label, 2200),
    vCell(value, TW-2200, {bold:!!bold}),
  ]});

  const termsTable = new Table({
    width:{size:TW,type:WidthType.DXA}, columnWidths:[2200,TW-2200],
    rows:[
      termRow("Delivery Terms",   contract.delivery_terms||""),
      termRow("Port of Loading",  contract.loading_port||""),
      termRow("Port of Discharge",contract.destination||""),
      termRow("Shipment Period",  contract.shipment_period||""),
      termRow("Payment Terms",    contract.payment_condition||"", true),
      termRow("Contract Ref.",    contract.contract_no||""),
    ]
  });

  // Bank
  const bankRows = [
    ["Beneficiary", seller.name, true],
    ["Bank Name",   bank.bankName],
    ["Branch",      bank.branch],
    ["Account No.", bank.accNo, true],
    ...(bank.iban ? [["IBAN", bank.iban, true]] : []),
    ["SWIFT Code",  bank.swift, true],
    ["Currency",    bank.currency||"USD"],
  ].map(([l,v,b])=>new TableRow({children:[lCell(l,2200), vCell(v,TW-2200,{bold:!!b})]}));

  const bankTable = new Table({
    width:{size:TW,type:WidthType.DXA}, columnWidths:[2200,TW-2200],
    rows:bankRows
  });

  // Remarks
  const remarksBlock = [
    new Paragraph({spacing:{before:80,after:40},
      border:{bottom:{style:BorderStyle.SINGLE,size:2,color:"DDCC88"}},
      shading:{fill:CREAM,type:ShadingType.CLEAR},
      children:[new TextRun({text:"Remarks", bold:true, size:18, color:AMBER, font:"Arial"})]}),
    new Paragraph({spacing:{before:60,after:40},
      children:[new TextRun({text:"1.  This is a Proforma Invoice only and not a Commercial Invoice.", size:17, font:"Arial", color:"333333"})]}),
    new Paragraph({spacing:{before:40,after:40},
      children:[new TextRun({text:"2.  Goods will be shipped upon receipt of payment as per agreed payment terms.", size:17, font:"Arial", color:"333333"})]}),
    new Paragraph({spacing:{before:40,after:40},
      children:[new TextRun({text:"3.  All terms remain same as per the contract.", size:17, font:"Arial", color:"333333"})]}),
    new Paragraph({spacing:{before:60,after:80},
      children:[
        new TextRun({text:"* This Proforma Invoice is valid till:  ", size:17, font:"Arial", color:"333333"}),
        new TextRun({text:validityDate||"", bold:true, size:17, font:"Arial", color:NAVY}),
      ]}),
  ];

  // Sig
  const sigTable = new Table({
    width:{size:TW,type:WidthType.DXA}, columnWidths:[TW/2,TW/2],
    rows:[new TableRow({children:[
      new TableCell({
        width:{size:TW/2,type:WidthType.DXA}, borders:noBorders(), margins:{top:200,bottom:200,left:0,right:200},
        children:[
          new Paragraph({children:[new TextRun({text:"For Buyer:", bold:true, size:18, color:NAVY, font:"Arial"})]}),
          new Paragraph({spacing:{before:600}, children:[new TextRun({text:contract.buyer_name||"", size:17, color:"444444", font:"Arial"})]}),
          new Paragraph({children:[new TextRun({text:"Authorized Signatory", size:16, color:"888888", font:"Arial"})]}),
        ]
      }),
      new TableCell({
        width:{size:TW/2,type:WidthType.DXA}, borders:noBorders(), margins:{top:200,bottom:200,left:200,right:0},
        children:[
          new Paragraph({children:[new TextRun({text:"For "+seller.name+":", bold:true, size:18, color:NAVY, font:"Arial"})]}),
          new Paragraph({spacing:{before:600}, children:[new TextRun({text:"", size:17, font:"Arial"})]}),
          new Paragraph({children:[new TextRun({text:"Authorized Signatory", size:16, color:"888888", font:"Arial"})]}),
        ]
      }),
    ]})]
  });

  const spacer = new Paragraph({spacing:{before:240,after:120}, children:[new TextRun("")]});
  const secHdr = (txt) => new Paragraph({
    spacing:{before:280,after:120},
    border:{bottom:{style:BorderStyle.SINGLE,size:6,color:GOLD}},
    children:[new TextRun({text:txt, bold:true, size:20, color:NAVY, font:"Arial"})]
  });

  const doc = new Document({
    sections:[{
      properties:{
        page:{
          size:{width:11906,height:16838},
          margin:{top:1080,right:1080,bottom:1080,left:1080}
        }
      },
      headers:{
        default: new Header({children:[
          new Paragraph({alignment:AlignmentType.RIGHT,
            children:[new TextRun({text:seller.name+"  |  PROFORMA INVOICE  |  "+(piNo||""), size:15, color:STEEL, font:"Arial"})]})
        ]})
      },
      footers:{
        default: new Footer({children:[
          new Paragraph({alignment:AlignmentType.CENTER,
            border:{top:{style:BorderStyle.SINGLE,size:4,color:NAVY}},
            children:[
              new TextRun({text:seller.address, size:15, color:"555555", font:"Arial"}),
              new TextRun({text:"    |    Page ", size:15, color:"555555", font:"Arial"}),
              new TextRun({children:[PageNumber.CURRENT], size:15, color:NAVY, font:"Arial"}),
            ]})
        ]})
      },
      children:[
        ...titleBlock, spacer,
        secHdr("Parties"), partiesTable, spacer,
        secHdr("Items"), itemsTable, spacer,
        secHdr("Terms"), termsTable, spacer,
        secHdr("Bank Details for Payment"), bankTable, spacer,
        ...remarksBlock, spacer,
        secHdr("Signatures"), sigTable,
      ]
    }]
  });

  const blob = await Packer.toBlob(doc);
  const url  = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "PI_"+(piNo||contract.contract_no||"draft")+".docx";
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

// ─── Compute effective payment for an invoice ─────────────────────────────────
// Rule: IRM bank charges are absorbed by the FIRST invoice linked to that IRM
// (first = earliest BRC insertion order in irm_allocations array order)
function calcEffectivePaid(invoiceNo, allBRCs, allIRMs) {
  // Build a map: irmId -> last invoice that uses it (by BRC array order)
  // allBRCs is ordered by insertion (DB order preserved in fetch)
  const irmLastInvoice = {};
  allBRCs.forEach(brc => {
    if (!brc.linked_invoice_no) return;
    (brc.irm_allocations || []).forEach(a => {
      if (a.irmId) {
        irmLastInvoice[String(a.irmId)] = brc.linked_invoice_no;
      }
    });
  });

  // Now sum payments for this invoice
  const sBRCs = allBRCs.filter(b => b.linked_invoice_no === invoiceNo);
  let paidUSD = 0, paidINR = 0;
  sBRCs.forEach(brc => {
    (brc.irm_allocations || []).forEach(a => {
      const irm = allIRMs.find(i => String(i.id) === String(a.irmId));
      if (!irm) return;
      const util = n(a.irmUtilAmt);
      const rate = n(irm.exchange_rate);
      // Absorb charges if this invoice is the last linked to this IRM
      const charges = irmLastInvoice[String(a.irmId)] === invoiceNo
        ? n(irm.intermediary_charges_usd || 0)
        : 0;
      paidUSD += util + charges;
      paidINR += (util + charges) * rate;
    });
  });
  return { paidUSD, paidINR };
}

function exportContractPDF(contract, buyer, consignee) {
  const JPDF = getPDF();
  if (!JPDF) { alert("PDF library not loaded. Please refresh and try again."); return; }
  const doc = new JPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const M = 15;
  const pw = 210 - M * 2;
  const navy  = [18, 52, 96];      // deep navy (logo color)
  const steel = [70, 130, 180];    // steel blue (mid tone)
  const ltblue= [220, 235, 250];   // light blue (header bg)
  const gold  = [162, 120, 50];    // gold accent
  const lgold = [210, 175, 100];
  const cream = [248, 251, 255];   // light blue-tinted cream
  const lgray = [235, 243, 252];   // light blue-gray for table rows
  const dgray = [190, 198, 210];
  const white = [255, 255, 255];
  const green = [22, 100, 50];

  // ── Watermark (logo faded) ────────────────────────────────────────────────
  // Resolve seller company (safe fallback)
  const seller = COMPANIES[(contract.seller_company||"devratan")] || COMPANIES.devratan;

  const addWatermark = () => {
    // Use actual watermark PNG centered on page
    try {
      doc.addImage(WATERMARK_B64, "PNG", 45, 85, 120, 90);
    } catch(e) {
      // Fallback text watermark
      doc.setFontSize(38); doc.setFont(undefined, "bold");
      doc.setTextColor(235, 237, 242);
      doc.text("DEVRATAN", 108, 162, { align: "center", angle: 38 });
    }
    doc.setTextColor(0, 0, 0);
  };

  // ── Page decorations ──────────────────────────────────────────────────────
  const addPageDecor = () => {
    doc.setFillColor(...navy); doc.rect(0, 288, 210, 9, "F");
    doc.setFontSize(6.5); doc.setTextColor(...white); doc.setFont(undefined, "normal");
    doc.text(seller.name + (seller.phone?" |  "+seller.phone:"") + (seller.email?"  |  "+seller.email:"") + (seller.web?"  |  "+seller.web:"") + (seller.gstin?"  |  "+seller.gstin:""), 105, 294, { align: "center" });
    addWatermark();
  };

  // ── Section heading ───────────────────────────────────────────────────────
  const sectionHead = (title, yPos) => {
    if (yPos > 254) { doc.addPage(); addPageDecor(); yPos = 24; }
    // Full-width background strip
    doc.setFillColor(...navy);
    doc.roundedRect(M, yPos, pw, 7, 1, 1, "F");
    // Left gold accent
    doc.setFillColor(...gold);
    doc.roundedRect(M, yPos, 4, 7, 1, 1, "F");
    doc.setFontSize(9); doc.setFont(undefined, "bold"); doc.setTextColor(...white);
    doc.text(title, M + 8, yPos + 4.8);
    doc.setTextColor(0, 0, 0);
    return yPos + 10;
  };

  // ── Clause item (justified) ───────────────────────────────────────────────
  const addClause = (text, yPos) => {
    if (yPos > 275) { doc.addPage(); addPageDecor(); yPos = 24; }
    doc.setFont(undefined, "normal"); doc.setFontSize(8.2); doc.setTextColor(25, 25, 25);
    // Gold bullet
    doc.setFillColor(...gold);
    doc.circle(M + 3.5, yPos - 0.4, 0.85, "F");
    const maxW = pw - 8;
    const lines = doc.splitTextToSize(text, maxW);
    lines.forEach((line, li) => {
      if (yPos > 275) { doc.addPage(); addPageDecor(); yPos = 24; }
      const isLast = li === lines.length - 1;
      if (!isLast && lines.length > 1) {
        // Justify: spread words across full width
        const words = line.split(" ");
        if (words.length > 1) {
          const lineW = doc.getTextWidth(line);
          const spaceW = (maxW - lineW) / (words.length - 1);
          let cx = M + 7;
          words.forEach((w, wi) => {
            doc.text(w, cx, yPos);
            cx += doc.getTextWidth(w) + doc.getTextWidth(" ") + spaceW;
          });
        } else {
          doc.text(line, M + 7, yPos);
        }
      } else {
        doc.text(line, M + 7, yPos);
      }
      yPos += 4.5;
    });
    return yPos + 1.5;
  };

  // ═══════════════════════════════════════════════════════
  // PAGE 1 HEADER
  // ═══════════════════════════════════════════════════════
  addWatermark();

  // ── Header: light blue background (matches brand) ─────────────────────────
  // Main header bg — light blue
  doc.setFillColor(...ltblue); doc.rect(0, 0, 210, 46, "F");


  // Logo — directly on light blue, no box needed (blue eagle on light bg)
  try {
    if (LOGO_B64) doc.addImage(LOGO_B64, "PNG", 10, 3, 38, 38);
  } catch(e) {
    doc.setFontSize(9); doc.setFont(undefined, "bold"); doc.setTextColor(...navy);
    doc.text("DEVRATAN", 28, 18, { align: "center" });
    doc.setFontSize(5.5); doc.setFont(undefined, "normal"); doc.setTextColor(...steel);
    doc.text("ENTERPRISES LLP", 28, 23, { align: "center" });
  }

  // Thin vertical divider after logo
  doc.setDrawColor(...steel); doc.setLineWidth(0.4);
  doc.line(52, 6, 52, 40);

  // Company name & info — navy text on light blue
  doc.setFontSize(12); doc.setFont(undefined, "bold"); doc.setTextColor(...navy);
  doc.text(seller.name, 57, 13);
  // Gold underline under company name
  const cnW = doc.getTextWidth(seller.name); doc.setFontSize(12);
  doc.setDrawColor(...gold); doc.setLineWidth(0.6);
  doc.line(57, 14.5, 57 + cnW, 14.5);
  doc.setFontSize(7); doc.setFont(undefined, "italic"); doc.setTextColor(...steel);
  doc.text(seller.tagline, 57, 18.5);
  doc.setFont(undefined, "normal"); doc.setTextColor(...navy); doc.setFontSize(6.5);
  doc.text(seller.address, 57, 23);
  doc.text(seller.phone + (seller.email?"  |  "+seller.email:"") + (seller.web?"  |  "+seller.web:""), 57, 27.5);
  if(seller.gstin) doc.text(seller.gstin, 57, 32);

  // SALE CONTRACT — right block (navy text on light blue)
  doc.setFontSize(17); doc.setFont(undefined, "bold"); doc.setTextColor(...navy);
  doc.text("SALE CONTRACT", 210 - M, 13, { align: "right" });
  // Gold underline under title
  const tw = doc.getTextWidth("SALE CONTRACT"); doc.setFontSize(17);
  doc.setDrawColor(...gold); doc.setLineWidth(0.8);
  doc.line(210 - M - tw, 15, 210 - M, 15);

  // Contract No
  doc.setFontSize(7); doc.setFont(undefined, "normal"); doc.setTextColor(...steel);
  doc.text("CONTRACT NO.", 210 - M, 21, { align: "right" });
  doc.setFontSize(9.5); doc.setFont(undefined, "bold"); doc.setTextColor(...navy);
  doc.text(contract.contract_no || "---", 210 - M, 27.5, { align: "right" });

  // Date
  doc.setFontSize(7); doc.setFont(undefined, "bold"); doc.setTextColor(...navy);
  doc.text("Date: " + (contract.contract_date || ""), 210 - M, 33.5, { align: "right" });

  // Status badge
  if (contract.status === "final") {
    doc.setFillColor(22, 163, 74); doc.roundedRect(210 - M - 20, 36, 20, 6, 1.5, 1.5, "F");
    doc.setFontSize(7); doc.setFont(undefined, "bold"); doc.setTextColor(255, 255, 255);
    doc.text("FINAL", 210 - M - 10, 40.5, { align: "center" });
  }

  doc.setTextColor(0, 0, 0);
  let y = 50;

  // ── Thin steel rule under header ──────────────────────────────────────────
  doc.setDrawColor(...steel); doc.setLineWidth(0.3);
  doc.line(M, y - 2, M + pw, y - 2);

  // ── PARTY TABLE ───────────────────────────────────────────────────────────
  const buyerAddr  = contract.buyer_address  || buyer?.address     || "";
  const hasConsignee = !!(contract.consignee_id && contract.consignee_name);
  const consigneeAddr = contract.consignee_address || consignee?.address || "";

  // Build rows — 3 columns: label | name (bold) | address+clause
  const partyRows = [
    [
      { content: "SELLER", styles: { fontStyle: "bold", halign: "center", valign: "middle", fillColor: navy, textColor: white, fontSize: 8 } },
      { content: seller.name, styles: { fontStyle: "bold", textColor: navy, fillColor: cream, fontSize: 8.5 } },
      { content: seller.address + "\n(Hereinafter referred to as \"the Seller\")", styles: { fontSize: 7.8, fillColor: cream, textColor: [50, 50, 50] } },
    ],
    [
      { content: "BUYER", styles: { fontStyle: "bold", halign: "center", valign: "middle", fillColor: navy, textColor: white, fontSize: 8 } },
      { content: contract.buyer_name || "", styles: { fontStyle: "bold", textColor: navy, fillColor: cream, fontSize: 8.5 } },
      { content: buyerAddr + "\n(Hereinafter referred to as \"the Buyer\")", styles: { fontSize: 7.8, fillColor: cream, textColor: [50, 50, 50] } },
    ],
  ];
  if (hasConsignee) {
    partyRows.push([
      { content: "CONSIGNEE", styles: { fontStyle: "bold", halign: "center", valign: "middle", fillColor: navy, textColor: white, fontSize: 8 } },
      { content: contract.consignee_name || "", styles: { fontStyle: "bold", textColor: navy, fillColor: cream, fontSize: 8.5 } },
      { content: consigneeAddr + "\n(Hereinafter referred to as \"the Consignee\")", styles: { fontSize: 7.8, fillColor: cream, textColor: [50, 50, 50] } },
    ]);
  }

  doc.autoTable({
    startY: y, body: partyRows,
    styles: { cellPadding: { top: 4, bottom: 4, left: 5, right: 5 }, valign: "top", lineColor: dgray, lineWidth: 0.25, overflow: "linebreak" },
    columnStyles: {
      0: { cellWidth: 22, halign: "center" },
      1: { cellWidth: 52 },
      2: { cellWidth: pw - 74 },
    },
    tableLineColor: steel, tableLineWidth: 0.4,
    margin: { left: M, right: M }, tableWidth: pw,
  });
  y = doc.lastAutoTable.finalY + 5;

  // ── Gold double rule ──────────────────────────────────────────────────────
  doc.setDrawColor(...gold); doc.setLineWidth(0.7);
  doc.line(M, y, M + pw, y);
  doc.setDrawColor(...lgold); doc.setLineWidth(0.3);
  doc.line(M, y + 1.5, M + pw, y + 1.5);
  y += 6;

  // ── CONTRACT TERMS TABLE ──────────────────────────────────────────────────
  const items = (contract.items && contract.items.length)
    ? contract.items
    : [{packing:contract.packing||"", quantity_mt:contract.quantity_mt||"", container_qty:contract.container_qty||"", container_type:contract.container_type||"", price_usd:contract.price_usd||"", price_per:contract.price_per||"MTs"}];

  const baseTerms = (contract.delivery_terms || "CIF").split(" ")[0];

  // Build items display string
  const itemsDisplay = items.map((it,i)=>{
    const parts = [];
    if(it.packing) parts.push(it.packing);
    if(it.quantity_mt) parts.push(it.quantity_mt+" MTS");
    if(it.container_qty && it.container_type) parts.push(it.container_qty+" x "+it.container_type);
    if(it.price_usd) parts.push("USD "+it.price_usd+" per "+(it.price_per||"MTs")+" "+baseTerms);
    return (items.length>1?"("+(i+1)+") ":"")+parts.join(" | ");
  }).join("\n");

  const totQty = items.reduce((s,it)=>s+n(it.quantity_mt),0);
  const totVal = items.reduce((s,it)=>s+n(it.quantity_mt)*n(it.price_usd),0);

  const selectedDocs = Array.isArray(contract.selected_docs) ? contract.selected_docs : [];
  const docsText = ALL_DOCS.filter(d => selectedDocs.includes(d.key)).map(d => {
    if (d.key === "other_document") {
      return contract.other_doc_name ? contract.other_doc_name : "Other Document";
    }
    return d.label;
  }).join("\n");

  const termRows = [
    [{ content: "Commodity",       styles: { fontStyle: "bold", fillColor: lgray, textColor: navy } }, { content: contract.commodity || "", styles: { fontStyle: "bold", textColor: [20, 80, 20] } }],
    ...(items.length===1
      ? [
          [{ content: "Packing",       styles: { fontStyle: "bold", fillColor: lgray, textColor: navy } }, { content: items[0].packing || "" }],
          [{ content: "Quantity",      styles: { fontStyle: "bold", fillColor: lgray, textColor: navy } }, { content: (items[0].quantity_mt||"")+" MTS "+(contract.quantity_tolerance||"")+"\n"+(items[0].container_qty&&items[0].container_type?items[0].container_qty+" x "+items[0].container_type:"") }],
          [{ content: "Price",         styles: { fontStyle: "bold", fillColor: lgray, textColor: navy } }, { content: "USD "+(items[0].price_usd||"")+" Per "+(items[0].price_per||"MTs")+" "+(contract.delivery_terms||"CIF"), styles: { fontStyle: "bold", textColor: [20, 80, 20] } }],
        ]
      : [
          [{ content: "Items ("+items.length+" lines)", styles: { fontStyle: "bold", fillColor: lgray, textColor: navy } }, { content: itemsDisplay }],
          [{ content: "Total Qty",     styles: { fontStyle: "bold", fillColor: lgray, textColor: navy } }, { content: totQty+" MTS "+( contract.quantity_tolerance||""), styles: { fontStyle: "bold", textColor: [20, 80, 20] } }],
          [{ content: "Total Value",   styles: { fontStyle: "bold", fillColor: lgray, textColor: navy } }, { content: "USD "+totVal.toLocaleString("en-IN",{minimumFractionDigits:0,maximumFractionDigits:0})+" "+baseTerms, styles: { fontStyle: "bold", textColor: [20, 80, 20] } }],
        ]
    ),
    [{ content: "Loading Port",    styles: { fontStyle: "bold", fillColor: lgray, textColor: navy } }, { content: contract.loading_port || "" }],
    [{ content: "Destination",     styles: { fontStyle: "bold", fillColor: lgray, textColor: navy } }, { content: contract.destination || "" }],
    [{ content: "Specification",   styles: { fontStyle: "bold", fillColor: lgray, textColor: navy } }, { content: contract.specification || "" }],
    [{ content: "Shipment",        styles: { fontStyle: "bold", fillColor: lgray, textColor: navy } }, { content: contract.shipment_period || "" }],
    [{ content: "Payment Terms",   styles: { fontStyle: "bold", fillColor: lgray, textColor: navy } }, { content: contract.payment_condition || "", styles: { fontStyle: "bold" } }],
    [{ content: "Documents Required", styles: { fontStyle: "bold", fillColor: lgray, textColor: navy } }, { content: docsText }],
  ];

  doc.autoTable({
    startY: y, body: termRows,
    styles: { fontSize: 8.5, cellPadding: { top: 3.5, bottom: 3.5, left: 5, right: 5 }, valign: "top", lineColor: dgray, lineWidth: 0.25, overflow: "linebreak" },
    columnStyles: { 0: { cellWidth: 34 }, 1: { cellWidth: pw - 34 } },
    tableLineColor: gold, tableLineWidth: 0.4,
    alternateRowStyles: { fillColor: [249, 251, 255] },
    margin: { left: M, right: M }, tableWidth: pw,
  });
  y = doc.lastAutoTable.finalY + 6;

  // ── Special Conditions ────────────────────────────────────────────────────
  if (contract.special_conditions && contract.special_conditions.trim()) {
    // Set font first so splitTextToSize uses correct metrics
    doc.setFontSize(8.2); doc.setFont(undefined, "normal");
    const scLines = doc.splitTextToSize(contract.special_conditions, pw - 12);
    const lineH = 4.8;
    const labelH = 8;
    const padV = 5;
    const boxH = labelH + scLines.length * lineH + padV;

    // Page break if box won't fit
    if (y + boxH > 275) { doc.addPage(); addPageDecor(); y = 24; }

    // Draw box
    doc.setFillColor(...lgray); doc.setDrawColor(...gold); doc.setLineWidth(0.5);
    doc.roundedRect(M, y, pw, boxH, 2, 2, "FD");

    // Label
    doc.setFontSize(8.5); doc.setFont(undefined, "bold"); doc.setTextColor(...navy);
    doc.text("Special Conditions:", M + 5, y + 5.5);
    y += labelH;

    // Content lines — with per-line page break
    doc.setFont(undefined, "normal"); doc.setTextColor(40, 40, 40); doc.setFontSize(8.2);
    scLines.forEach(line => {
      if (y > 278) {
        doc.addPage(); addPageDecor(); y = 24;
        // Redraw box background for continuation
        doc.setFillColor(...lgray); doc.setDrawColor(...gold); doc.setLineWidth(0.5);
        const remH = (scLines.length * lineH) + padV;
        doc.roundedRect(M, y - 2, pw, remH, 2, 2, "FD");
        doc.setFont(undefined, "normal"); doc.setTextColor(40, 40, 40); doc.setFontSize(8.2);
      }
      doc.text(line, M + 6, y);
      y += lineH;
    });
    y += padV;
  }

  // ── TERMS & CONDITIONS ────────────────────────────────────────────────────
  y = sectionHead("Terms & Conditions:", y);

  const tc = [
    "All customs duties and formalities are for Seller's account at loading port.",
    "The Documents will be delivered through Sellers Bank to the Buyers Bank or telex release depends on buyer choice.",
    "Bank charges at Seller's bank paid at the Seller's expense, at Buyer's bank and correspondent bank - at the Buyer's expense.",
    "The Seller shall deliver Goods in FCL lot on basis of " + baseTerms + ", according to INCOTERMS 2020.",
    "None of the Parties is entitled to transfer its rights and obligations under the present Contract to a third party without the other Party's previous written consent.",
    "All amendments and additions to the present Contract are valid only if they are made out in writing and signed by both Parties. All amendments to the present Contract are integral part of it.",
    "The present Contract is signed in two originals in English, one for each Party.",
    "The Contract will come in force at the moment of its signing by the Parties and continues until the Parties fully perform their obligations under the present Contract.",
    "The duration of the contract is 3 months after duly signing of the contract by both parties.",
    "Weight & Quality will be finalized at loading port only by any third-party surveyor & accepted as final report.",
    "If buyer fails to make payment of the documents as per the contract, the seller reserves the right to protect his interest and accordingly this contract acts as implied no objection certificate/confirmation from buyer to seller to transfer/resell to alternate buyer. This clause therefore serves as valid no objection certificate to customs or any statutory authorities to clear the cargo. Under these circumstances seller can unconditionally choose to cancel the contract and withdraw or re-route the documents and sell the cargo as per seller choice.",
    "This facsimile/email/whatsapp transmission of the signed contract shall be treated as valid and legal.",
    "Payment: " + (contract.payment_condition || ""),
  ];
  if (contract.war_risk_clause !== false) {
    tc.splice(11, 0, "WAR RISK & EXTRAORDINARY CHARGES (IMPORTANT): Notwithstanding the agreed Incoterms (including " + baseTerms + "), any increase or additional charges arising after the date of contract due to war, hostilities, geopolitical tensions, sanctions, route deviations, or similar circumstances - including but not limited to War Risk Surcharge (WRS), Emergency Risk Surcharge (ERS), additional insurance premium, port congestion surcharge, or any unforeseen charges imposed by shipping lines, carriers, port authorities, or insurers - shall be borne by the Buyer. These charges shall be payable by the Buyer immediately upon demand and shall be over and above the agreed contract price.");
  }
  tc.forEach(clause => { y = addClause(clause, y); });

  // ── FORCE MAJEURE ─────────────────────────────────────────────────────────
  y = sectionHead("Force Majeure:", y);
  [
    "The parties have agreed, that in case of force majeure circumstances (actions of a force majeure, which do not depend on will of the Parties), namely: wars, military actions, blockade, embargo, other international sanctions, currency restrictions, other actions of the states, that make impossible performance by the Parties of their obligations, fires, floods, other act of nature or seasonal natural phenomena, in particular such as freezing of the sea, straits, ports etc., closing of ways, straits, channels, crossings, the Parties are released from performance of their obligations during the time when the specified circumstances are in action.",
    "In case if action of the specified circumstances lasts more than 30 days, each of the Parties has the right to cancel the present Contract and does not bear the responsibility for such cancellation provided that it will notify on it other Party not later than 15 days before cancellation.",
    "The sufficient proof of action of force majeure circumstances is the document given by Commercial and industrial chamber or other representative on distribution of such documents by a state body.",
  ].forEach(clause => { y = addClause(clause, y); });

  // ── ARBITRATION ───────────────────────────────────────────────────────────
  y = sectionHead("Arbitration:", y);
  [
    "All disputes or differences that may arise out of this Contract or in connection with it shall be settled by amicable talks.",
    "In the case that it is impossible to settle disputes by negotiations then disputes shall be settled in the competent Court at the domicile of the defendant.",
    "The awards of this Arbitration Court shall be final and binding upon both Parties concerned.",
  ].forEach(clause => { y = addClause(clause, y); });

  // ── SIGNATURE BLOCK ───────────────────────────────────────────────────────
  if (y > 238) { doc.addPage(); addPageDecor(); y = 24; }
  y += 4;
  doc.setDrawColor(...gold); doc.setLineWidth(0.8);
  doc.line(M, y, M + pw, y);
  doc.setDrawColor(...lgold); doc.setLineWidth(0.3);
  doc.line(M, y + 1.5, M + pw, y + 1.5);
  y += 6;

  const sigW = pw / 2 - 4;
  const drawSigBox = (x, label, name) => {
    // White background box with gold border
    doc.setFillColor(255, 255, 255); doc.setDrawColor(...gold); doc.setLineWidth(0.7);
    doc.roundedRect(x, y, sigW, 50, 2, 2, "FD");
    // Navy label header bar
    doc.setFillColor(...navy);
    doc.roundedRect(x, y, sigW, 9, 2, 2, "F");
    doc.rect(x, y + 5, sigW, 4, "F"); // flatten bottom corners of header
    doc.setFontSize(9); doc.setFont(undefined, "bold"); doc.setTextColor(255, 255, 255);
    doc.text(label, x + sigW / 2, y + 6.5, { align: "center" });
    // Name — bold, navy, centered, underlined
    doc.setFontSize(9); doc.setFont(undefined, "bold"); doc.setTextColor(...navy);
    const nameLines = doc.splitTextToSize(name, sigW - 10);
    let ny = y + 18;
    nameLines.forEach(nl => {
      const nw = doc.getTextWidth(nl);
      const nx2 = x + sigW / 2;
      doc.text(nl, nx2, ny, { align: "center" });
      // Underline each name line
      doc.setDrawColor(...navy); doc.setLineWidth(0.45);
      doc.line(nx2 - nw / 2, ny + 1.5, nx2 + nw / 2, ny + 1.5);
      ny += 5.5;
    });
    // Signature line
    doc.setDrawColor(...dgray); doc.setLineWidth(0.4);
    doc.line(x + 8, y + 40, x + sigW - 8, y + 40);
    doc.setFont(undefined, "normal"); doc.setFontSize(7.5); doc.setTextColor(100, 100, 100);
    doc.text("Authorized Signature & Stamp", x + sigW / 2, y + 46, { align: "center" });
  };

  drawSigBox(M, "SELLER", seller.name);
  drawSigBox(M + sigW + 8, "BUYER", contract.buyer_name || "");

  // ── FOOTER on every page ──────────────────────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFillColor(...navy); doc.rect(0, 290, 210, 7, "F");
    doc.setFontSize(6.5); doc.setTextColor(...white); doc.setFont(undefined, "normal");
    doc.text(seller.name + (seller.phone?" |  "+seller.phone:"") + (seller.email?"  |  "+seller.email:"") + (seller.web?"  |  "+seller.web:"") + (seller.gstin?"  |  "+seller.gstin:""), 105, 293.5, { align: "center" });
    // Gold page number pill
    doc.setFillColor(...gold); doc.roundedRect(M + pw - 16, 283.5, 16, 6, 1.5, 1.5, "F");
    doc.setFontSize(7); doc.setFont(undefined, "bold"); doc.setTextColor(...navy);
    doc.text(i + " / " + totalPages, M + pw - 8, 287.5, { align: "center" });
  }

  doc.save("Contract_" + (contract.contract_no || "draft") + ".pdf");
}


// ─── Proforma Invoice PDF Export ──────────────────────────────────────────────
// ─── Number to Words (USD amounts) ────────────────────────────────────────────
function numberToWords(amount) {
  if (!amount || isNaN(amount)) return "ZERO US DOLLARS ONLY";
  const ones = ["","ONE","TWO","THREE","FOUR","FIVE","SIX","SEVEN","EIGHT","NINE",
    "TEN","ELEVEN","TWELVE","THIRTEEN","FOURTEEN","FIFTEEN","SIXTEEN","SEVENTEEN","EIGHTEEN","NINETEEN"];
  const tens = ["","","TWENTY","THIRTY","FORTY","FIFTY","SIXTY","SEVENTY","EIGHTY","NINETY"];
  const scales = ["","THOUSAND","MILLION","BILLION"];
  const toWords = (n) => {
    if (n === 0) return "";
    if (n < 20) return ones[n] + " ";
    if (n < 100) return tens[Math.floor(n/10)] + (n%10 ? " "+ones[n%10] : "") + " ";
    return ones[Math.floor(n/100)] + " HUNDRED " + toWords(n%100);
  };
  const dollars = Math.floor(amount);
  const cents   = Math.round((amount - dollars) * 100);
  let result = "";
  let num = dollars, scaleIdx = 0;
  while (num > 0) {
    const chunk = num % 1000;
    if (chunk !== 0) {
      result = toWords(chunk) + (scales[scaleIdx] ? scales[scaleIdx]+" " : "") + result;
    }
    num = Math.floor(num / 1000);
    scaleIdx++;
  }
  result = result.trim();
  if (!result) result = "ZERO";
  result += " US DOLLAR" + (dollars !== 1 ? "S" : "");
  if (cents > 0) result += " AND " + toWords(cents).trim() + " CENT" + (cents !== 1 ? "S" : "");
  return result + " ONLY";
}

function exportProformaInvoicePDF(contract, buyer, piNo, validityDate, advancePct) {
  const JPDF = getPDF();
  if (!JPDF) { alert("PDF library not loaded. Please refresh and try again."); return; }
  const doc = new JPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const M  = 14;
  const pw = 182; // 210 - 14*2 = 182mm exact

  const navy   = [18,  52,  96];
  const steel  = [70,  130, 180];
  const ltblue = [220, 235, 250];
  const gold   = [162, 120, 50];
  const lgold  = [210, 175, 100];
  const lgray  = [235, 243, 252];
  const dgray  = [180, 192, 208];
  const white  = [255, 255, 255];
  const green  = [21,  97,  51];
  const cream  = [248, 251, 255];
  const amber  = [146, 64,  14];

  const seller = COMPANIES[(contract.seller_company||"devratan")] || COMPANIES.devratan;
  const bank   = BANK_DETAILS[(contract.seller_company||"devratan")] || BANK_DETAILS.devratan;

  const items = (contract.items && contract.items.length)
    ? contract.items
    : [{packing:contract.packing||"", quantity_mt:contract.quantity_mt||"",
        container_qty:contract.container_qty||"", container_type:contract.container_type||"",
        price_usd:contract.price_usd||"", price_per:contract.price_per||"MTs"}];

  const totQty = items.reduce((s,it) => s + n(it.quantity_mt), 0);
  const totVal = items.reduce((s,it) => s + n(it.quantity_mt) * n(it.price_usd), 0);
  const advAmt = advancePct ? (totVal * advancePct / 100) : 0;
  const fmt2   = v => Number(v).toLocaleString("en-IN", {minimumFractionDigits:2, maximumFractionDigits:2});
  const usd    = v => "USD " + fmt2(v);

  // ── Footer ────────────────────────────────────────────────────────────────
  const drawFooter = () => {
    const tp = doc.getNumberOfPages();
    for (let i = 1; i <= tp; i++) {
      doc.setPage(i);
      doc.setFillColor(...navy); doc.rect(0, 290, 210, 7, "F");
      doc.setFontSize(6.5); doc.setFont(undefined,"normal"); doc.setTextColor(...white);
      doc.text(
        seller.name
          + (seller.phone ? "   |   " + seller.phone : "")
          + (seller.email ? "   |   " + seller.email : "")
          + (seller.gstin ? "   |   GSTIN: " + seller.gstin : ""),
        105, 294, { align:"center" }
      );
      doc.setFillColor(...gold);
      doc.roundedRect(M + pw - 18, 283, 18, 7, 1.5, 1.5, "F");
      doc.setFontSize(7); doc.setFont(undefined,"bold"); doc.setTextColor(...navy);
      doc.text(i + " / " + tp, M + pw - 9, 287.2, { align:"center" });
    }
  };

  // ── HEADER ────────────────────────────────────────────────────────────────
  doc.setFillColor(...ltblue); doc.rect(0, 0, 210, 46, "F");
  try { if (LOGO_B64) doc.addImage(LOGO_B64, "PNG", 10, 3, 38, 38); } catch(e) {}
  doc.setDrawColor(...steel); doc.setLineWidth(0.4);
  doc.line(52, 6, 52, 40);
  doc.setFontSize(12); doc.setFont(undefined,"bold"); doc.setTextColor(...navy);
  doc.text(seller.name, 57, 13);
  const cnW = doc.getTextWidth(seller.name);
  doc.setDrawColor(...gold); doc.setLineWidth(0.6);
  doc.line(57, 14.5, 57 + cnW, 14.5);
  doc.setFontSize(7); doc.setFont(undefined,"italic"); doc.setTextColor(...steel);
  doc.text(seller.tagline || "", 57, 18.5);
  doc.setFont(undefined,"normal"); doc.setTextColor(...navy); doc.setFontSize(6.5);
  doc.text(seller.address, 57, 23);
  doc.text((seller.phone||"") + (seller.email ? "   |   " + seller.email : ""), 57, 27.5);
  if (seller.gstin) doc.text(seller.gstin, 57, 32);

  doc.setFontSize(16); doc.setFont(undefined,"bold"); doc.setTextColor(...navy);
  doc.text("PROFORMA INVOICE", 210 - M, 12, { align:"right" });
  const tw = doc.getTextWidth("PROFORMA INVOICE");
  doc.setDrawColor(...gold); doc.setLineWidth(0.8);
  doc.line(210 - M - tw, 14, 210 - M, 14);
  doc.setFontSize(7.5); doc.setFont(undefined,"normal"); doc.setTextColor(...steel);
  doc.text("PI NO.", 210 - M, 20, { align:"right" });
  doc.setFontSize(10); doc.setFont(undefined,"bold"); doc.setTextColor(...navy);
  doc.text(piNo || "---", 210 - M, 26.5, { align:"right" });
  doc.setFontSize(7); doc.setFont(undefined,"normal"); doc.setTextColor(...navy);
  doc.text("Date: " + (contract.contract_date || ""), 210 - M, 32, { align:"right" });
  if (validityDate) {
    doc.setFontSize(6.5); doc.setTextColor(...steel);
    doc.text("Valid till: " + validityDate, 210 - M, 37, { align:"right" });
  }

  let y = 50;

  // ── PARTIES ───────────────────────────────────────────────────────────────
  const buyerAddr = contract.buyer_address || buyer?.address || "";
  doc.autoTable({
    startY: y,
    body: [
      [
        { content:"SELLER", styles:{ fontStyle:"bold", halign:"center", valign:"middle", fillColor:navy, textColor:white, fontSize:8 } },
        { content:seller.name, styles:{ fontStyle:"bold", textColor:navy, fillColor:cream, fontSize:9 } },
        { content:seller.address, styles:{ fontSize:7.5, fillColor:cream, textColor:[50,50,50] } },
      ],
      [
        { content:"BUYER", styles:{ fontStyle:"bold", halign:"center", valign:"middle", fillColor:navy, textColor:white, fontSize:8 } },
        { content:contract.buyer_name || "", styles:{ fontStyle:"bold", textColor:navy, fillColor:cream, fontSize:9 } },
        { content:buyerAddr, styles:{ fontSize:7.5, fillColor:cream, textColor:[50,50,50] } },
      ],
    ],
    styles:{ cellPadding:{top:4,bottom:4,left:6,right:6}, valign:"top", lineColor:dgray, lineWidth:0.3, fontSize:8 },
    columnStyles:{ 0:{cellWidth:20,halign:"center"}, 1:{cellWidth:55}, 2:{cellWidth:pw-75} },
    tableLineColor:steel, tableLineWidth:0.5,
    margin:{left:M,right:M}, tableWidth:pw,
  });
  y = doc.lastAutoTable.finalY + 4;

  doc.setDrawColor(...gold); doc.setLineWidth(0.8);
  doc.line(M, y, M + pw, y);
  doc.setDrawColor(...lgold); doc.setLineWidth(0.3);
  doc.line(M, y + 1.5, M + pw, y + 1.5);
  y += 7;

  // ── ITEMS TABLE ─────────────────────────────────────────────────────────
  // pw=182 | cols: 8+52+34+20+24+20+24 = 182
  const C = { no:8, desc:52, pack:34, qty:20, cont:24, price:20, amt:24 };

  // Cell builders
  const IH = (txt, w, al) => ({
    content: txt,
    styles: {
      fillColor:navy, textColor:white, fontStyle:"bold",
      fontSize:8.5, cellPadding:{top:6,bottom:6,left:5,right:5},
      halign:al||"left", valign:"middle", cellWidth:w, lineWidth:0,
    }
  });

  const ID = (txt, w, al, bold, tc, bg) => ({
    content: String(txt||""),
    styles: {
      fillColor: bg || white,
      textColor: tc || [40,40,40],
      fontStyle: bold ? "bold" : "normal",
      fontSize: 8.5,
      cellPadding:{top:5,bottom:5,left:5,right:5},
      halign:al||"left", valign:"middle", cellWidth:w,
      overflow:"linebreak", lineWidth:0.25, lineColor:[215,225,240],
    }
  });

  const itemHead = [[
    IH("#",             C.no,    "center"),
    IH("Description",   C.desc,  "left"),
    IH("Packing",       C.pack,  "left"),
    IH("Qty (MTS)",     C.qty,   "right"),
    IH("Containers",    C.cont,  "center"),
    IH("Unit Price",    C.price, "right"),
    IH("Amount (USD)",  C.amt,   "right"),
  ]];

  const itemBody = items.map((it, idx) => {
    const qty   = n(it.quantity_mt);
    const price = n(it.price_usd);
    const amt   = qty * price;
    const bg    = idx % 2 === 0 ? white : [246,249,255];
    return [
      ID(idx+1,                                   C.no,    "center", false, [150,160,185], bg),
      ID(contract.commodity||"",                  C.desc,  "left",   true,  navy,          bg),
      ID(it.packing||"",                          C.pack,  "left",   false, [60,80,115],   bg),
      ID(qty   ? fmt2(qty)   : "",               C.qty,   "right",  true,  [30,30,30],    bg),
      ID(it.container_qty&&it.container_type
          ? it.container_qty+" x "+it.container_type : "",
                                                  C.cont,  "center", false, [70,90,130],   bg),
      ID(price ? fmt2(price) : "",               C.price, "right",  false, [30,30,30],    bg),
      ID(amt   ? fmt2(amt)   : "",               C.amt,   "right",  true,  green,         bg),
    ];
  });

  // TOTAL row
  itemBody.push([
    ID("",                C.no,    "center", false, navy,  lgray),
    ID("TOTAL",           C.desc,  "left",   true,  navy,  lgray),
    ID(contract.quantity_tolerance||"+/- 5% at seller's option",
                          C.pack,  "left",   false, [110,130,160], lgray),
    ID(fmt2(totQty),      C.qty,   "right",  true,  navy,  lgray),
    ID("",                C.cont,  "center", false, navy,  lgray),
    ID("",                C.price, "right",  false, navy,  lgray),
    ID(usd(totVal),       C.amt,   "right",  true,  white, gold),
  ]);

  // ADVANCE row
  if (advancePct) {
    itemBody.push([
      ID("",              C.no,    "center", false, amber, [255,249,235]),
      ID("Advance ("+advancePct+"%) Due", C.desc, "left", true, amber, [255,249,235]),
      ID("",              C.pack,  "left",   false, amber, [255,249,235]),
      ID("",              C.qty,   "right",  false, amber, [255,249,235]),
      ID("",              C.cont,  "center", false, amber, [255,249,235]),
      ID("",              C.price, "right",  false, amber, [255,249,235]),
      ID(usd(advAmt),     C.amt,   "right",  true,  amber, [255,243,205]),
    ]);
  }

  doc.autoTable({
    startY: y,
    head: itemHead,
    body: itemBody,
    styles: {
      fontSize:8.5, cellPadding:{top:5,bottom:5,left:5,right:5},
      valign:"middle", overflow:"linebreak",
      lineColor:[215,225,240], lineWidth:0.25,
    },
    headStyles: {
      fontSize:8.5, cellPadding:{top:6,bottom:6,left:5,right:5},
      valign:"middle", lineWidth:0,
    },
    columnStyles: {
      0:{cellWidth:C.no},   1:{cellWidth:C.desc},
      2:{cellWidth:C.pack}, 3:{cellWidth:C.qty},
      4:{cellWidth:C.cont}, 5:{cellWidth:C.price},
      6:{cellWidth:C.amt},
    },
    tableLineColor: [170,190,215], tableLineWidth: 0.5,
    margin:{left:M, right:M}, tableWidth:pw,
    didDrawCell: (data) => {
      if (data.section === "head") {
        // Gold underline on header
        doc.setDrawColor(...gold); doc.setLineWidth(1.0);
        doc.line(data.cell.x, data.cell.y+data.cell.height,
                 data.cell.x+data.cell.width, data.cell.y+data.cell.height);
      }
      if (data.section === "body" && data.row.index === items.length) {
        // Navy top line above TOTAL row
        doc.setDrawColor(...navy); doc.setLineWidth(0.7);
        doc.line(data.cell.x, data.cell.y,
                 data.cell.x+data.cell.width, data.cell.y);
      }
    },
  });
  y = doc.lastAutoTable.finalY + 3;

  // ── Amount in Words ───────────────────────────────────────────────────
  const amtWords = numberToWords(totVal);
  doc.setFillColor(...lgray); doc.setDrawColor(...steel); doc.setLineWidth(0.4);
  doc.roundedRect(M, y, pw, 8, 1.5, 1.5, "FD");
  doc.setFontSize(7.5); doc.setFont(undefined,"bold"); doc.setTextColor(...navy);
  doc.text("Amount in Words:", M+5, y+5.2);
  const lblW = doc.getTextWidth("Amount in Words: ");
  doc.setFont(undefined,"italic"); doc.setTextColor(30,30,30);
  doc.text(amtWords, M+5+lblW, y+5.2, {maxWidth: pw-10-lblW});
  y += 11;

  // ── TERMS TABLE ──────────────────────────────────────────────────────────
  const lSt = { fontStyle:"bold", fillColor:lgray, textColor:navy, fontSize:8.5,
                cellPadding:{top:3.5,bottom:3.5,left:6,right:6}, valign:"middle", cellWidth:42 };
  const vSt = { fontSize:8.5, textColor:[20,20,20],
                cellPadding:{top:3.5,bottom:3.5,left:6,right:6}, valign:"middle", cellWidth:pw-42, overflow:"linebreak" };

  doc.autoTable({
    startY:y,
    body:[
      [{ content:"Delivery Terms",    styles:lSt }, { content:contract.delivery_terms    || "", styles:vSt }],
      [{ content:"Port of Loading",   styles:lSt }, { content:contract.loading_port      || "", styles:vSt }],
      [{ content:"Port of Discharge", styles:lSt }, { content:contract.destination       || "", styles:vSt }],
      [{ content:"Shipment Period",   styles:lSt }, { content:contract.shipment_period   || "", styles:vSt }],
      [{ content:"Payment Terms",     styles:lSt }, { content:contract.payment_condition || "", styles:{...vSt,fontStyle:"bold"} }],
      [{ content:"Contract Ref.",     styles:lSt }, { content:contract.contract_no       || "", styles:vSt }],
    ],
    styles:{ fontSize:8.5, cellPadding:{top:3.5,bottom:3.5,left:6,right:6}, valign:"middle", lineColor:dgray, lineWidth:0.3 },
    columnStyles:{ 0:{cellWidth:42}, 1:{cellWidth:pw-42} },
    tableLineColor:steel, tableLineWidth:0.4,
    alternateRowStyles:{ fillColor:[249,251,255] },
    margin:{left:M,right:M}, tableWidth:pw,
  });
  y = doc.lastAutoTable.finalY + 6;

  // ── BANK DETAILS ─────────────────────────────────────────────────────────
  if (y > 218) { doc.addPage(); y = 20; }

  doc.setFillColor(...navy); doc.roundedRect(M, y, pw, 8, 1.5, 1.5, "F");
  doc.setFillColor(...gold); doc.roundedRect(M, y, 5, 8, 1.5, 1.5, "F");
  doc.rect(M + 3, y, 2, 8, "F");
  doc.setFontSize(9); doc.setFont(undefined,"bold"); doc.setTextColor(...white);
  doc.text("Bank Details for Payment", M + 10, y + 5.5);
  y += 12;

  const bL = (txt) => ({ content:txt, styles:{ fontStyle:"bold", fillColor:lgray, textColor:navy,
    fontSize:8.5, cellWidth:40, cellPadding:{top:3.5,bottom:3.5,left:6,right:6}, valign:"middle" } });
  const bV = (txt, bold) => ({ content:String(txt||""), styles:{ fontStyle:bold?"bold":"normal",
    fontSize:8.5, textColor:[20,20,20], cellWidth:pw-40,
    cellPadding:{top:3.5,bottom:3.5,left:6,right:6}, valign:"middle", overflow:"linebreak" } });

  doc.autoTable({
    startY:y,
    body:[
      [ bL("Beneficiary"),  bV(seller.name, true)   ],
      [ bL("Bank Name"),    bV(bank.bankName)        ],
      [ bL("Branch"),       bV(bank.branch)          ],
      [ bL("Account No."),  bV(bank.accNo,  true)    ],
      ...(bank.ifsc ? [[ bL("IFSC Code"), bV(bank.ifsc) ]] : []),
      ...(bank.iban ? [[ bL("IBAN"),      bV(bank.iban, true) ]] : []),
      [ bL("SWIFT Code"),   bV(bank.swift, true)     ],
      [ bL("Currency"),     bV(bank.currency||"USD") ],
    ],
    styles:{ fontSize:8.5, cellPadding:{top:3.5,bottom:3.5,left:6,right:6}, valign:"middle", lineColor:dgray, lineWidth:0.3 },
    columnStyles:{ 0:{cellWidth:40}, 1:{cellWidth:pw-40} },
    tableLineColor:steel, tableLineWidth:0.4,
    alternateRowStyles:{ fillColor:[249,251,255] },
    margin:{left:M,right:M}, tableWidth:pw,
  });
  y = doc.lastAutoTable.finalY + 7;

  // ── REMARKS BOX ──────────────────────────────────────────────────────────
  if (y > 248) { doc.addPage(); y = 20; }

  doc.setFontSize(8.2); doc.setFont(undefined,"normal");
  const remarkLines = [
    "1.  This is a Proforma Invoice only and not a Commercial Invoice.",
    "2.  Goods will be shipped upon receipt of payment as per agreed payment terms.",
    "3.  All terms remain same as per the contract.",
  ];
  const lineH   = 5.5;
  const validTxtH = 7;
  const boxH    = 6 + remarkLines.length * lineH + validTxtH + 4;
  doc.setFillColor(254, 252, 232); doc.setDrawColor(...gold); doc.setLineWidth(0.6);
  doc.roundedRect(M, y, pw, boxH, 2, 2, "FD");

  let ry = y + 6.5;
  doc.setTextColor(60, 40, 5);
  remarkLines.forEach(line => {
    doc.text(line, M + 6, ry, { maxWidth: pw - 12 });
    ry += lineH;
  });

  ry += 2;
  const prefix = "* This Proforma Invoice is valid till:  ";
  doc.setFont(undefined,"normal"); doc.setTextColor(60, 40, 5);
  doc.text(prefix, M + 6, ry);
  const prefW = doc.getTextWidth(prefix);
  doc.setFont(undefined,"bold"); doc.setTextColor(...navy);
  doc.text(validityDate || "", M + 6 + prefW, ry);
  y += boxH + 8;

  // ── SIGNATURE ────────────────────────────────────────────────────────────
  if (y > 258) { doc.addPage(); y = 20; }

  const sigW = pw * 0.46;
  const sigX = M + pw - sigW;
  doc.setFillColor(...white); doc.setDrawColor(...gold); doc.setLineWidth(0.7);
  doc.roundedRect(sigX, y, sigW, 34, 2, 2, "FD");
  doc.setFillColor(...navy);
  doc.roundedRect(sigX, y, sigW, 9, 2, 2, "F");
  doc.rect(sigX, y + 5, sigW, 4, "F");
  doc.setFontSize(8.5); doc.setFont(undefined,"bold"); doc.setTextColor(...white);
  doc.text("FOR " + seller.name, sigX + sigW / 2, y + 6.2, { align:"center", maxWidth:sigW - 8 });
  doc.setDrawColor(...dgray); doc.setLineWidth(0.4);
  doc.line(sigX + 10, y + 26, sigX + sigW - 10, y + 26);
  doc.setFont(undefined,"normal"); doc.setFontSize(7.5); doc.setTextColor(100,100,100);
  doc.text("Authorized Signatory", sigX + sigW / 2, y + 31, { align:"center" });

  drawFooter();
  doc.save("PI_" + (piNo || contract.contract_no || "draft") + ".pdf");
}




function BankingFormsTab({ships, buyers, bcs}){
  const FORMS = [
    {id:"advance",  label:"SBI Advance Payment Form",         icon:"💵"},
    {id:"bc_form",  label:"SBI Export Bill Collection Form",  icon:"📤"},
    {id:"a2",       label:"SBI Form A-2",                     icon:"📋"},
    {id:"freight",  label:"SBI Freight Payment Form",         icon:"🚢"},
  ];
  const [activeForm, setActiveForm] = useState("advance");

  return(
    <div>
      <div style={{marginBottom:16}}>
        <h2 style={{margin:"0 0 4px",color:"#1e3a5f",fontSize:17}}>🏛 Banking Forms</h2>
        <p style={{margin:0,fontSize:11,color:"#64748b"}}>SBI bank forms — fill and export as PDF or Word</p>
      </div>
      {/* Form selector */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:20}}>
        {FORMS.map(f=>(
          <button key={f.id} onClick={()=>setActiveForm(f.id)}
            style={{background:activeForm===f.id?"#1e3a5f":"#f8fafc",
                    color:activeForm===f.id?"#fff":"#374151",
                    border:activeForm===f.id?"none":"1px solid #e2e8f0",
                    borderRadius:10,padding:"10px 8px",cursor:"pointer",
                    fontWeight:activeForm===f.id?700:500,fontSize:12,textAlign:"center",
                    boxShadow:activeForm===f.id?"0 2px 8px rgba(30,58,96,0.3)":"none"}}>
            <div style={{fontSize:20,marginBottom:4}}>{f.icon}</div>
            <div style={{lineHeight:1.3}}>{f.label}</div>
          </button>
        ))}
      </div>
      {activeForm==="advance"  && <AdvancePaymentForm ships={ships} buyers={buyers}/>}
      {activeForm==="bc_form"  && <ExportBCForm ships={ships} buyers={buyers}/>}
      {activeForm==="a2"       && <FormA2 ships={ships}/>}
      {activeForm==="freight"  && <FreightPaymentForm ships={ships}/>}
    </div>
  );
}

// ── Shared field helpers ───────────────────────────────────────────────────────
function FRow({label, children, required}){
  return(
    <div style={{display:"grid",gridTemplateColumns:"220px 1fr",gap:8,marginBottom:8,alignItems:"start"}}>
      <label style={{fontSize:12,color:"#374151",fontWeight:600,paddingTop:8}}>
        {label}{required&&<span style={{color:"#dc2626",marginLeft:2}}>*</span>}
      </label>
      <div>{children}</div>
    </div>
  );
}
function FInput({value,onChange,placeholder,type,readOnly}){
  return <input type={type||"text"} value={value||""} onChange={e=>onChange&&onChange(e.target.value)}
    readOnly={readOnly} placeholder={placeholder||""}
    style={{...iS,fontSize:12,background:readOnly?"#f1f5f9":"#fff"}}/>;
}
function FTextarea({value,onChange,rows,placeholder}){
  return <textarea value={value||""} onChange={e=>onChange&&onChange(e.target.value)}
    rows={rows||2} placeholder={placeholder||""}
    style={{...iS,fontSize:12,resize:"vertical"}}/>;
}
function SectionHeader({title}){
  return <div style={{background:"#1e3a5f",color:"#fff",fontWeight:700,fontSize:13,
                      padding:"7px 14px",borderRadius:7,marginTop:16,marginBottom:10}}>{title}</div>;
}
function ExportButtons({onPDF, onWord}){
  return(
    <div style={{display:"flex",gap:10,marginTop:20,justifyContent:"flex-end"}}>
      <button onClick={onWord}
        style={{background:"linear-gradient(135deg,#1e3a5f,#2563eb)",color:"#fff",border:"none",
                borderRadius:8,padding:"8px 20px",cursor:"pointer",fontWeight:700,fontSize:13}}>
        📝 Export Word
      </button>
      <button onClick={onPDF}
        style={{background:"linear-gradient(135deg,#15803d,#16a34a)",color:"#fff",border:"none",
                borderRadius:8,padding:"8px 20px",cursor:"pointer",fontWeight:700,fontSize:13}}>
        📄 Export PDF
      </button>
    </div>
  );
}

// ── Form 1: Advance Payment Form ───────────────────────────────────────────────
function AdvancePaymentForm({ships, buyers}){
  const today=new Date().toLocaleDateString("en-IN",{day:"2-digit",month:"2-digit",year:"numeric"}).replace(/\//g,".");
  const [f,setF]=useState({
    date:today,
    fcy_amount:"", fcy_currency:"USD",
    advance_type:"Advance against Export of Goods",
    remitter_name:"", remitter_address:"",
    consignee:"N.A.",
    description:"", hsn:"10063019",
    pi_no:"", pi_date:"",
    expected_date:"",
    country_origin:"INDIA", port_loading:"", port_discharge:"", country_dest:"",
    goods_category:"Free",
    cc_fcy:"", epc_fcy:"",
    epc_ref_no:"",
    fwd_contracts:[],
    charges_account:"41289547389",
    other_docs:"",
    contact_name:"AKSHAY MITTAL", contact_mobile:"9111282828", contact_email:"MITTAL94@GMAIL.COM",
    place:"INDORE",
  });
  const sf=(k,v)=>setF(p=>({...p,[k]:v}));

  const addFwdContract=()=>{
    if(f.fwd_contracts.length>=5) return;
    setF(p=>({...p,fwd_contracts:[...p.fwd_contracts,{no:"",amt:"",due:"",util:""}]}));
  };
  const updFwd=(i,k,v)=>setF(p=>{const arr=[...p.fwd_contracts];arr[i]={...arr[i],[k]:v};return{...p,fwd_contracts:arr};});
  const delFwd=(i)=>setF(p=>({...p,fwd_contracts:p.fwd_contracts.filter((_,j)=>j!==i)}));

  const toDisplayDate=iso=>{
    if(!iso)return"";
    const[y,m,d]=iso.split("-");
    return`${d}.${m}.${y}`;
  };
  const toISODate=dd=>{
    if(!dd)return"";
    const[d,m,y]=dd.split(".");
    return`${y}-${m}-${d}`;
  };

  const exportPDF=()=>{
    const JPDF=getPDF(); if(!JPDF) return;
    const doc=new JPDF({orientation:"portrait",unit:"mm",format:"a4"});
    const M=15, RW=180;
    const navy=[18,52,96], steel=[70,130,180], ltblue=[220,235,250], gold=[162,120,50], white=[255,255,255];
    const seller=COMPANIES.devratan;

    const NF=(bold,sz)=>{doc.setFont("helvetica",bold?"bold":"normal");doc.setFontSize(sz||9);doc.setTextColor(0,0,0);};
    const TXT=(t,x,y,opts)=>{doc.text(String(t||""),x,y,opts||{});};
    const WRAP=(t,x,y,mw,lh)=>{const ls=doc.splitTextToSize(String(t||""),mw);doc.text(ls,x,y);return y+ls.length*(lh||4.5);};
    const RECT=(x,y,w,h)=>{doc.setDrawColor(80,80,80);doc.setLineWidth(0.2);doc.rect(x,y,w,h);};
    const chkPg=(yPos,needed)=>{if(yPos+(needed||8)>280){doc.addPage();pdfHeader();return 52;}return yPos;};

    const pdfHeader=()=>{
      doc.setFillColor(...ltblue); doc.rect(0,0,210,46,"F");
      try{if(LOGO_B64)doc.addImage(LOGO_B64,"PNG",10,3,38,38);}catch(e){}
      doc.setDrawColor(...steel); doc.setLineWidth(0.4); doc.line(52,6,52,40);
      doc.setFontSize(12); doc.setFont("helvetica","bold"); doc.setTextColor(...navy);
      doc.text(seller.name,57,13);
      const cnW=doc.getTextWidth(seller.name);
      doc.setDrawColor(...gold); doc.setLineWidth(0.6); doc.line(57,14.5,57+cnW,14.5);
      doc.setFontSize(7); doc.setFont("helvetica","italic"); doc.setTextColor(...steel);
      doc.text(seller.tagline||"",57,18.5);
      doc.setFont("helvetica","normal"); doc.setTextColor(0,0,0); doc.setFontSize(6.5);
      doc.text(seller.address,57,23);
      doc.text((seller.phone||"")+(seller.email?"  |  "+seller.email:""),57,27.5);
      if(seller.gstin) doc.text(seller.gstin,57,32);
      doc.setTextColor(0,0,0);
    };

    const pdfFooter=()=>{
      const tp=doc.getNumberOfPages();
      for(let i=1;i<=tp;i++){
        doc.setPage(i);
        doc.setFillColor(...navy); doc.rect(0,288,210,9,"F");
        doc.setFontSize(6.5); doc.setFont("helvetica","normal"); doc.setTextColor(...white);
        doc.text(seller.name+"  |  "+seller.phone+"  |  "+seller.email,105,293,{align:"center"});
        doc.setFont("helvetica","bold"); doc.setTextColor(220,220,220);
        doc.text("Page "+i+" of "+tp,M+RW-2,293,{align:"right"});
      }
    };

    // ── PAGE 1: APPLICATION ───────────────────────────────────────────────────
    pdfHeader();
    let y=50;

    // Title
    NF(true,10); doc.setTextColor(...navy);
    doc.text("APPLICATION FOR PROCESSING OF EXPORT ADVANCE PAYMENT",105,y,{align:"center"});
    doc.setTextColor(0,0,0); y+=8;

    // Date + address block
    NF(false,9);
    doc.text("Date: "+f.date,M,y); y+=5.5;
    doc.text("To,",M,y); y+=5;
    doc.text("The Branch Head, State Bank of India",M,y); y+=5;
    doc.text("Industrial Finance Branch, YN Road, Indore",M,y); y+=5;
    doc.text("Dear Sir / Madam,",M,y); y+=7;

    // Subject bold
    NF(true,9);
    doc.text("Processing of Foreign Inward Remittance Towards Export Advance Payment",M,y); y+=6;

    // Applicant line: "Name of the Applicant: " normal + "DEVRATAN..." bold + "   IEC: AARFD8883D" normal
    NF(false,9);
    const naPre="Name of the Applicant: ";
    doc.text(naPre,M,y);
    NF(true,9);
    const naW=doc.getStringUnitWidth(naPre)*9/doc.internal.scaleFactor;
    doc.text("DEVRATAN ENTERPRISES LLP",M+naW,y);
    NF(false,9);
    const naW2=doc.getStringUnitWidth("DEVRATAN ENTERPRISES LLP")*9/doc.internal.scaleFactor;
    doc.text("   IEC: AARFD8883D",M+naW+naW2,y);
    y+=6;

    // Amount line: sentence with bold FCY amount inline
    NF(false,9);
    const amtPre="I/We request you to process the Export Advance Payment of ";
    const amtVal=f.fcy_currency+" "+f.fcy_amount;
    doc.text(amtPre,M,y);
    NF(true,9);
    const preW=doc.getStringUnitWidth(amtPre)*9/doc.internal.scaleFactor;
    doc.text(amtVal,M+preW,y);
    NF(false,9);
    const valW=doc.getStringUnitWidth(amtVal)*9/doc.internal.scaleFactor;
    doc.text(" received by you in our favour, as mentioned below –",M+preW+valW,y);
    y+=4.5;
    doc.text("(tick whichever is applicable)",M,y); y+=6;

    // Advance type — proper checkbox symbols using PDF font
    // Use simple [ ] and [X] with standard font
    const advOpts=[
      ["Advance against Export of Goods","Advance against Export of Software"],
      ["Advance against Export of Services","Advance against Long Term Exports"],
    ];
    const bw=RW/2, bh=7;
    NF(false,8.5);
    for(let r=0;r<2;r++){
      for(let c2=0;c2<2;c2++){
        const opt=advOpts[r][c2];
        const bx=M+c2*bw;
        RECT(bx,y,bw,bh);
        const chk=f.advance_type===opt?"[X]":"[ ]";
        doc.text(chk+" "+opt,bx+2,y+4.5);
      }
      y+=bh;
    }
    y+=4;

    // Export Details
    NF(true,9); doc.text("Export Details:",M,y); y+=4;
    const piVal=(f.pi_no||"")+(f.pi_date?" Dated "+f.pi_date:"");
    const dtRows=[
      ["a.","Name of the Remitter",":",f.remitter_name],
      ["b.","Remitter's Address (with Country Name)",":",f.remitter_address],
      ["c.","Details of Consignee / Buyer (if different from the Remitter, Invoice / Tripartite Agreement or any other supporting document to be furnished)",":",f.consignee],
      ["d.","Description of Goods & Quantity / Nature of Services (along with Purpose Code)",":",f.description],
      ["e.","HSN / SAC Code",":",f.hsn],
      ["f.","Details of Proforma Invoice & Purchase Order / Underlying Document (No. & Date)",":",piVal],
      ["g.","Expected Date of Export of Goods / Services",":",f.expected_date],
      ["h.","Country of Origin of Goods",":",f.country_origin],
      ["i.","Port of Loading / Airport of Departure",":",f.port_loading],
      ["j.","Port of Discharge / Airport of Destination",":",f.port_discharge],
      ["k.","Country of Destination",":",f.country_dest],
      ["l.","If Merchanting Trade (if second leg)",":", "Import Leg details: Shipment Date ________ Txn. Ref. No. ________"],
      ["m.","Country of Loading/Shipment (in case of MTT)",":", "N.A."],
      ["n.","Goods Category",":", f.goods_category],
    ];
    const c0=8,c1=82,c2=5,c3=RW-c0-c1-c2;
    NF(false,8.5);
    dtRows.forEach(([sr,lbl,col,val])=>{
      const lL=doc.splitTextToSize(lbl,c1-2);
      const vL=doc.splitTextToSize(String(val||""),c3-2);
      const rh=Math.max(lL.length,vL.length)*4+3;
      y=chkPg(y,rh);
      RECT(M,y,c0,rh); RECT(M+c0,y,c1,rh); RECT(M+c0+c1,y,c2,rh); RECT(M+c0+c1+c2,y,c3,rh);
      doc.text(sr,M+1,y+4);
      doc.text(lL,M+c0+1,y+4);
      doc.text(col,M+c0+c1+1,y+4);
      doc.text(vL,M+c0+c1+c2+1,y+4);
      y+=rh;
    });
    y+=2;

    // Restricted note
    NF(false,7.5);
    y=WRAP("(In case of Restricted goods, enclose original Exchange Control Copy of Export License issued by DGFT, if obtained)",M,y,RW,4);
    y+=1;
    NF(false,8); doc.text("Export License Details (for restricted goods):",M,y); y+=4;
    const licH=[["License No",36],["Date of Issue",36],["Date of Expiry",36],["License Value",36],["Amount Utilised",36]];
    let lx=M; NF(false,7.5);
    licH.forEach(([h,w])=>{RECT(lx,y,w,7);doc.text(h,lx+1,y+4.5,{maxWidth:w-2});lx+=w;});
    y+=7; lx=M;
    licH.forEach(([h,w])=>{RECT(lx,y,w,6);lx+=w;});
    y+=8;

    // Credit Proceeds — check if it fits, else new page
    y=chkPg(y,55);
    NF(true,9); doc.text("Credit the Proceeds to:",M+5,y); y+=5;
    // 4-col table: Account | Account No | FCY | Blank
    const cCols=[65,55,60];
    // Header row
    NF(true,7.5);
    let cx=M;
    cCols.forEach((w,i)=>{
      RECT(cx,y,w,6);
      const hd=["Account","Account No. (Fixed)","FCY Amount"][i];
      doc.text(hd,cx+1,y+4,{maxWidth:w-2});
      cx+=w;
    });
    y+=6;
    const creditRows=[["Cash Credit Account","41289547389",f.cc_fcy],["EPC / PCFC Account","41269117338",f.epc_fcy]];
    NF(false,8.5);
    creditRows.forEach(([acc,no,fcy])=>{
      cx=M;
      cCols.forEach((w,i)=>{
        RECT(cx,y,w,6);
        const v=[acc,no,String(fcy||"")][i];
        doc.text(v,cx+1,y+4,{maxWidth:w-2});
        cx+=w;
      });
      y+=6;
    });
    y+=3;
    NF(false,8); doc.text("EPC/PCFC Ref. No: "+(f.epc_ref_no||""),M+5,y); y+=7;

    // Forward Contract
    y=chkPg(y,20);
    NF(true,9); doc.text("Forward Contract Details (if any, to be utilized):",M,y); y+=4;
    const fwH=[["S No",12],["Forward Contract No",46],["Forward Contract Amount",42],["Forward Contract Due Date",42],["Amount to be Utilised",38]];
    let fx=M; NF(false,7.5);
    fwH.forEach(([h,w])=>{RECT(fx,y,w,8);doc.text(h,fx+1,y+4.5,{maxWidth:w-2});fx+=w;});
    y+=8;
    const fwData=f.fwd_contracts.length>0?f.fwd_contracts:[{no:"",amt:"",due:"",util:""},{no:"",amt:"",due:"",util:""}];
    NF(false,8.5);
    fwData.forEach((fc,i)=>{
      fx=M;
      [String(i+1),fc.no||"",fc.amt||"",fc.due?toDisplayDate(fc.due):"",fc.util||""].forEach((v,j)=>{
        RECT(fx,y,fwH[j][1],6); doc.text(v,fx+1,y+4,{maxWidth:fwH[j][1]-2}); fx+=fwH[j][1];
      });
      y+=6;
    });
    y+=4;

    // Charges
    y=chkPg(y,10);
    NF(false,8.5);
    y=WRAP("The relative charges along with applicable taxes (if any) may please be recovered from our Cash Credit/ Current Account No. "+f.charges_account,M+5,y,RW-5,4.5);
    y+=5;

    // Documents
    y=chkPg(y,35);
    NF(true,9); doc.text("Documents enclosed: (strike off, whichever is not applicable)",M,y); y+=5;
    NF(false,8.5);
    ["Purchase Order / Firm agreement for supply of Goods/Software.",
     "Proforma Invoice / Contract.",
     "Original valid license for export of restricted goods.",
     "For export of rough diamonds, Kimberley Process Certificate of Exporter.",
     "Other documents (please specify, if any): "+(f.other_docs||""),
    ].forEach(d=>{y=chkPg(y,6);doc.text("\u2022  "+d,M+5,y,{maxWidth:RW-10});y+=5;});
    y+=3;

    // Contact table
    y=chkPg(y,32);
    RECT(M,y,RW,6); NF(true,8.5); doc.setTextColor(...navy);
    doc.text("Contact Details for this transaction:",M+2,y+4);
    y+=6; doc.setTextColor(0,0,0);
    [["Name",":",f.contact_name],["Mobile No.",":",f.contact_mobile],["Email ID",":",f.contact_email]].forEach(([l,c2,v])=>{
      RECT(M,y,50,5); RECT(M+50,y,5,5); RECT(M+55,y,RW-55,5);
      NF(false,8.5); doc.text(l,M+1,y+3.5); doc.text(c2,M+51,y+3.5); doc.text(String(v||""),M+56,y+3.5);
      y+=5;
    });
    y+=12; // Space for signature

    // Sign block p1
    y=chkPg(y,20);
    NF(true,9);
    doc.text("Date: "+f.date,M,y);
    doc.text("Authorised Signatory (ies)",M+RW-55,y); y+=5;
    doc.text("Place: "+f.place,M,y); y+=6;
    NF(false,8); doc.text("(Please affix Company/Firm Stamp)",M+RW-65,y); y+=5;
    NF(true,8); doc.text("*[All pages to be signed by the Authorised Signatory(ies)]",M,y);

    // ── PAGE 2: UNDERTAKING — tight layout to fit 1 page ─────────────────────
    doc.addPage(); pdfHeader();
    y=50;
    NF(true,9.5); doc.setTextColor(...navy);
    doc.text("UNDERTAKING-CUM-DECLARATION FOR PROCESSING OF EXPORT ADVANCE PAYMENT",105,y,{align:"center"});
    doc.setTextColor(0,0,0); y+=7;

    NF(true,8.5); doc.text("I / We hereby undertake and declare that:",M,y); y+=5;
    NF(true,8.5); doc.text("Section - A (FEMA Declaration):",M,y); y+=4;
    NF(false,7.5); y=WRAP("(Under Section10 (5), Chapter III of The Foreign Exchange Management Act, 1999)",M+3,y,RW-3,3.8);
    y+=3;

    const secA=[
      "1. The transaction mentioned in this application does not contravene the provisions of the Foreign Exchange Management Act 1999 (FEMA) and rules/regulations made thereunder.",
      "2. I/We hereby declare that the transaction, the details of which are specifically mentioned in this application does not involve and is not designed for the purpose of any contravention or evasion of the provisions of the aforesaid act of any rule, regulation, notification, direction, or order made thereunder.",
      "3. I/We also hereby agree and undertake to give such information/documents as may be reasonably required by you to your satisfaction about this transaction in terms of the above declaration.",
      "4. I/We also understand that if I/we refuse to comply with any such requirements or make only unsatisfactory compliance therewith, the Bank shall refuse to undertake the transaction and shall, if it has reason to believe that any contravention / evasion is contemplated by me/us, report the matter to Reserve Bank of India.",
      "5. I/We further declare that the undersigned has/have the authority to give this declaration and undertaking on behalf of the Firm/Company.",
    ];
    NF(false,7.5);
    secA.forEach(item=>{
      const ls=doc.splitTextToSize(item,RW-8);
      doc.text(ls,M+4,y); y+=ls.length*3.8+1.5;
    });
    y+=2;

    NF(true,8.5);
    const sbT="Section-B [Declaration for export of goods/software/services and submission of evidence of export and compliance with RBI guidelines]:";
    const sbL=doc.splitTextToSize(sbT,RW);
    doc.text(sbL,M,y); y+=sbL.length*4.2+2;

    const secB=[
      "1. We shall ensure that the export of goods/software/services is made within three years / permissible period from the date of receipt of Export advance payment and submit all the documents relating to export of goods/software/services to you (SBI) within 21 days from the date of export of goods or date of invoice (in case of software/services).",
      "2. I/we understand that in the event of my/our inability to fulfill the export obligation within three years / permissible period from the date of receipt of advance payment, no remittance towards refund of unutilized portion of advance payment or interest shall be made after the expiry of the said period of three years / permissible period, without the prior approval of the RBI.",
      "3. Rate of interest (if any) payable on advance payment does not exceed the rates prescribed by RBI from time to time.",
      "4. In case of third-party transaction, we undertake to incorporate the name(s) of third-party(ies) in the Invoice and Shipping Bill / Softex.",
      "5. In case of long-term export advance (with maximum tenor of 10 years), we confirm that: (a) The contract with the overseas party/ buyer has clear nature, amount and delivery timelines and penalty in case of non-performance or contract cancellation. (b) We have the capacity and systems to ensure orders over the tenure can be executed. (c) The export advance will be adjusted through future exports. (d) The advance receipt will not be utilized to liquidate Rupee Loan classified as NPA. (e) Double financing for working capital for execution of related export order will not be obtained.",
      "6. I/We confirm that product pricing is in consonance with prevailing international prices.",
      "7. I/We undertake to comply with all regulatory guidelines issued by RBI, DGFT, Customs authorities, FEDAI, SBI, and any other regulatory/government agency as at the time of the transaction.",
      "8. I/we also agree that the exchange rate will be applicable at the time of deal booking and may vary from the rate prevailing when the request is submitted. I/we also understand that the rate communicated to us (if any) is an indicative rate and the actual rate may be different.",
      "9. I/We have not received payment against the same invoice/contract through any other AD Bank/branch.",
      "10. I/we also declare that the transaction does not have linkage with any Specially Designated Nationals and Blocked Persons (SDN)/countries listed under applicable sanctions laws (as imposed by US-OFAC, UN, EU, or any Other Government and/or Regulatory authorities) in any manner. I/we undertake not to hold State Bank of India (SBI) responsible for any of its action or inaction in respect of such transactions.",
      "11. I/We hereby provide my/our consent to (State Bank of India, i.e., the Bank or its successor or assignee) to share with external agencies (either manually/physically or electronically/digitally) certain information furnished by me/us (including but not limited to HSN/SAC Code/ IE Code/Counterparty details/ Bill of Lading/ other Transaction details and documents) for the purpose of due diligence.",
    ];
    NF(false,7.5);
    secB.forEach(item=>{
      const ls=doc.splitTextToSize(item,RW-8);
      doc.text(ls,M+4,y); y+=ls.length*3.8+1.5;
    });
    y+=12; // Space for signature

    // Sign block p2
    NF(true,9);
    doc.text("Date: "+f.date,M,y);
    doc.text("Authorised Signatory (ies)",M+RW-55,y); y+=5;
    doc.text("Place: "+f.place,M,y); y+=6;
    NF(false,8); doc.text("(Please affix Company/Firm Stamp)",M+RW-65,y);

    pdfFooter();
    doc.save("SBI_Advance_Payment_Form.pdf");
  };

  // ── FORM UI ───────────────────────────────────────────────────────────────
  return(
    <div style={{background:"#fff",borderRadius:12,padding:20,boxShadow:"0 1px 4px rgba(0,0,0,0.07)"}}>
      <h3 style={{margin:"0 0 4px",color:"#1e3a5f",fontSize:15}}>💵 Application for Processing of Export Advance Payment</h3>
      <p style={{margin:"0 0 16px",fontSize:11,color:"#64748b"}}>SBI Industrial Finance Branch, YN Road, Indore</p>

      <SectionHeader title="Basic Details"/>
      <FRow label="Date" required>
        <input type="date" value={toISODate(f.date)}
          onChange={e=>sf("date",toDisplayDate(e.target.value))}
          style={{...iS,fontSize:12}}/>
      </FRow>
      <FRow label="Amount in FCY" required>
        <div style={{display:"flex",gap:6}}>
          <select value={f.fcy_currency} onChange={e=>sf("fcy_currency",e.target.value)}
            style={{...iS,width:90,fontSize:12}}>
            {["USD","EUR","GBP","JPY","AED","SGD","AUD","CNY"].map(c=><option key={c}>{c}</option>)}
          </select>
          <FInput value={f.fcy_amount} onChange={v=>sf("fcy_amount",v)} placeholder="e.g. 46400.00"/>
        </div>
      </FRow>
      <FRow label="Advance Type">
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
          {["Advance against Export of Goods","Advance against Export of Software","Advance against Export of Services","Advance against Long Term Exports"].map(opt=>(
            <label key={opt} style={{display:"flex",alignItems:"center",gap:6,fontSize:12,cursor:"pointer",
              padding:"6px 10px",border:`2px solid ${f.advance_type===opt?"#1e3a5f":"#e2e8f0"}`,
              borderRadius:6,background:f.advance_type===opt?"#eff6ff":"#f8fafc",
              fontWeight:f.advance_type===opt?700:400}}>
              <input type="radio" name="advance_type" value={opt} checked={f.advance_type===opt}
                onChange={()=>sf("advance_type",opt)} style={{accentColor:"#1e3a5f"}}/>
              {opt}
            </label>
          ))}
        </div>
      </FRow>

      <SectionHeader title="Export Details"/>
      <FRow label="Name of Remitter" required><FInput value={f.remitter_name} onChange={v=>sf("remitter_name",v)}/></FRow>
      <FRow label="Remitter's Address (with Country)"><FTextarea value={f.remitter_address} onChange={v=>sf("remitter_address",v)}/></FRow>
      <FRow label="Consignee / Buyer (if different)"><FInput value={f.consignee} onChange={v=>sf("consignee",v)}/></FRow>
      <FRow label="Description of Goods & Qty + Purpose Code" required><FInput value={f.description} onChange={v=>sf("description",v)} placeholder="e.g. INDIAN PARBOILED RICE – 130 MT"/></FRow>
      <FRow label="HSN / SAC Code"><FInput value={f.hsn} onChange={v=>sf("hsn",v)}/></FRow>
      <FRow label="Proforma Invoice / PO No." required><FInput value={f.pi_no} onChange={v=>sf("pi_no",v)} placeholder="e.g. DEV-EXP-25/26-45"/></FRow>
      <FRow label="PI / PO Date" required>
        <input type="date" value={toISODate(f.pi_date)}
          onChange={e=>sf("pi_date",toDisplayDate(e.target.value))}
          style={{...iS,fontSize:12}}/>
      </FRow>
      <FRow label="Expected Date of Export">
        <input type="date" value={toISODate(f.expected_date)}
          onChange={e=>sf("expected_date",toDisplayDate(e.target.value))}
          style={{...iS,fontSize:12}}/>
      </FRow>
      <FRow label="Country of Origin"><FInput value={f.country_origin} onChange={v=>sf("country_origin",v)}/></FRow>
      <FRow label="Port of Loading" required><FInput value={f.port_loading} onChange={v=>sf("port_loading",v)}/></FRow>
      <FRow label="Port of Discharge" required><FInput value={f.port_discharge} onChange={v=>sf("port_discharge",v)}/></FRow>
      <FRow label="Country of Destination" required><FInput value={f.country_dest} onChange={v=>sf("country_dest",v)}/></FRow>
      <FRow label="Goods Category">
        <div style={{display:"flex",gap:12}}>
          {["Free","Restricted"].map(opt=>(
            <label key={opt} style={{display:"flex",alignItems:"center",gap:6,fontSize:12,cursor:"pointer",
              padding:"6px 14px",border:`2px solid ${f.goods_category===opt?"#1e3a5f":"#e2e8f0"}`,
              borderRadius:6,background:f.goods_category===opt?"#eff6ff":"#f8fafc",
              fontWeight:f.goods_category===opt?700:400}}>
              <input type="radio" name="goods_cat" value={opt} checked={f.goods_category===opt}
                onChange={()=>sf("goods_category",opt)} style={{accentColor:"#1e3a5f"}}/>
              {opt}
            </label>
          ))}
        </div>
      </FRow>

      <SectionHeader title="Credit the Proceeds To"/>
      <div style={{overflowX:"auto",marginBottom:10}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
          <thead>
            <tr>{["Account","Account No. (Fixed)","FCY Amount"].map(h=>(
              <th key={h} style={{border:"1px solid #e2e8f0",padding:"6px 8px",background:"#f1f5f9",textAlign:"left"}}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            <tr>
              <td style={{border:"1px solid #e2e8f0",padding:"6px 8px",fontWeight:600}}>Cash Credit Account</td>
              <td style={{border:"1px solid #e2e8f0",padding:"6px 8px",color:"#64748b"}}>41289547389</td>
              <td style={{border:"1px solid #e2e8f0",padding:4}}><input value={f.cc_fcy} onChange={e=>sf("cc_fcy",e.target.value)} placeholder={f.fcy_currency+" amount"} style={{...iS,fontSize:11}}/></td>
            </tr>
            <tr>
              <td style={{border:"1px solid #e2e8f0",padding:"6px 8px",fontWeight:600}}>EPC / PCFC Account</td>
              <td style={{border:"1px solid #e2e8f0",padding:"6px 8px",color:"#64748b"}}>41269117338</td>
              <td style={{border:"1px solid #e2e8f0",padding:4}}><input value={f.epc_fcy} onChange={e=>sf("epc_fcy",e.target.value)} placeholder={f.fcy_currency+" amount"} style={{...iS,fontSize:11}}/></td>
            </tr>
          </tbody>
        </table>
      </div>
      <FRow label="EPC/PCFC Ref. No"><FInput value={f.epc_ref_no} onChange={v=>sf("epc_ref_no",v)}/></FRow>

      <SectionHeader title="Forward Contract Details (if any)"/>
      {f.fwd_contracts.length>0&&(
        <div style={{overflowX:"auto",marginBottom:8}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead>
              <tr>{["S No","Contract No","FC Amount","Due Date","Amount to Utilise",""].map(h=>(
                <th key={h} style={{border:"1px solid #e2e8f0",padding:"5px 6px",background:"#f1f5f9",textAlign:"left",fontSize:11}}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {f.fwd_contracts.map((fc,i)=>(
                <tr key={i}>
                  <td style={{border:"1px solid #e2e8f0",padding:4,textAlign:"center",width:30}}>{i+1}</td>
                  <td style={{border:"1px solid #e2e8f0",padding:3}}><input value={fc.no} onChange={e=>updFwd(i,"no",e.target.value)} style={{...iS,fontSize:11}}/></td>
                  <td style={{border:"1px solid #e2e8f0",padding:3}}><input value={fc.amt} onChange={e=>updFwd(i,"amt",e.target.value)} placeholder={f.fcy_currency} style={{...iS,fontSize:11}}/></td>
                  <td style={{border:"1px solid #e2e8f0",padding:3}}><input type="date" value={fc.due||""} onChange={e=>updFwd(i,"due",e.target.value)} style={{...iS,fontSize:11}}/></td>
                  <td style={{border:"1px solid #e2e8f0",padding:3}}><input value={fc.util} onChange={e=>updFwd(i,"util",e.target.value)} placeholder={f.fcy_currency} style={{...iS,fontSize:11}}/></td>
                  <td style={{border:"1px solid #e2e8f0",padding:3,textAlign:"center"}}>
                    <button onClick={()=>delFwd(i)} style={{background:"#fee2e2",color:"#dc2626",border:"none",borderRadius:4,padding:"2px 8px",cursor:"pointer",fontSize:11}}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {f.fwd_contracts.length<5?(
        <button onClick={addFwdContract}
          style={{background:"#eff6ff",color:"#1d4ed8",border:"1px solid #bfdbfe",borderRadius:6,
                  padding:"5px 14px",cursor:"pointer",fontSize:12,fontWeight:600}}>
          + Add Forward Contract{f.fwd_contracts.length>0?" ("+f.fwd_contracts.length+"/5)":""}
        </button>
      ):<div style={{fontSize:11,color:"#64748b"}}>Maximum 5 forward contracts added.</div>}

      <SectionHeader title="Other Details"/>
      <FRow label="Charges from A/c No."><FInput value={f.charges_account} onChange={v=>sf("charges_account",v)}/></FRow>
      <FRow label="Other Documents (if any)"><FInput value={f.other_docs} onChange={v=>sf("other_docs",v)} placeholder="Specify if any"/></FRow>

      <SectionHeader title="Contact Details"/>
      <FRow label="Name"><FInput value={f.contact_name} onChange={v=>sf("contact_name",v)}/></FRow>
      <FRow label="Mobile No."><FInput value={f.contact_mobile} onChange={v=>sf("contact_mobile",v)}/></FRow>
      <FRow label="Email"><FInput value={f.contact_email} onChange={v=>sf("contact_email",v)}/></FRow>
      <FRow label="Place"><FInput value={f.place} onChange={v=>sf("place",v)}/></FRow>

      <div style={{marginTop:14,padding:"8px 12px",background:"#f0fdf4",borderRadius:8,fontSize:11,color:"#15803d"}}>
        📄 PDF: Page 1 — Application Form &nbsp;|&nbsp; Page 2 — Undertaking-cum-Declaration (Section A &amp; B, fits on 1 page)
      </div>
      <div style={{display:"flex",gap:10,marginTop:12,justifyContent:"flex-end"}}>
        <button onClick={exportPDF}
          style={{background:"linear-gradient(135deg,#15803d,#16a34a)",color:"#fff",border:"none",
                  borderRadius:8,padding:"8px 20px",cursor:"pointer",fontWeight:700,fontSize:13}}>
          📄 Export PDF
        </button>
      </div>
    </div>
  );
}



function ExportBCForm({ships, buyers}){
  const today=new Date().toLocaleDateString("en-IN",{day:"2-digit",month:"2-digit",year:"numeric"}).replace(/\//g,".");
  const toDisplay=iso=>{if(!iso)return"";const[y,m,d]=iso.split("-");return`${d}.${m}.${y}`;};
  const toISO=dd=>{if(!dd||!dd.includes("."))return"";const[d,m,y]=dd.split(".");return`${y}-${m}-${d}`;};

  const [f,setF]=useState({
    date:today,
    buyer_name:"", buyer_address:"",
    bill_type:"Non LC",
    export_type:"Regular",
    nature:"Goods",
    bill_amount:"", bill_ccy:"USD",
    payment_terms:"Sight",
    adv_ref_no:"",
    // Documents submitted
    doc_orig_bill:"", doc_orig_invoice:"", doc_orig_transport:"",
    doc_orig_packing:"", doc_orig_insurance:"", doc_orig_coo:"",
    doc_orig_test:"", doc_orig_others:"",
    doc_dup_bill:"", doc_dup_invoice:"", doc_dup_transport:"",
    doc_dup_packing:"", doc_dup_insurance:"", doc_dup_coo:"",
    doc_dup_test:"", doc_dup_others:"",
    invoice_no:"", invoice_date:"",
    sb_no:"", sb_date:"",
    lc_details:"",
    dispatch_name:"", dispatch_address:"", dispatch_swift:"", dispatch_contact:"",
    charges_india:"Our a/c",
    charges_outside:"Our a/c",
    mt_shipdate:"", mt_txn_ref:"",
    late_reason:"Late receipt of shipping documents from CHA",
    third_party:"No",
    charges_account:"41289547389",
    special_instructions:"",
    contact_name:"Akshay Mittal", contact_mobile:"9111282828", contact_email:"Mittal94@gmail.com",
    place:"Indore",
  });
  const sf=(k,v)=>setF(p=>({...p,[k]:v}));

  const exportPDF=()=>{
    const JPDF=getPDF(); if(!JPDF) return;
    const doc=new JPDF({orientation:"portrait",unit:"mm",format:"a4"});
    const M=15, RW=180;
    const navy=[18,52,96], steel=[70,130,180], ltblue=[220,235,250], gold=[162,120,50], white=[255,255,255];
    const seller=COMPANIES.devratan;

    const NF=(bold,sz)=>{doc.setFont("helvetica",bold?"bold":"normal");doc.setFontSize(sz||9);doc.setTextColor(0,0,0);};
    const TW=(t,sz)=>doc.getStringUnitWidth(t)*(sz||9)/doc.internal.scaleFactor;
    const WRAP=(t,x,y,mw,lh)=>{const ls=doc.splitTextToSize(String(t||""),mw);doc.text(ls,x,y);return y+ls.length*(lh||4.5);};
    const RECT=(x,y,w,h)=>{doc.setDrawColor(80,80,80);doc.setLineWidth(0.2);doc.rect(x,y,w,h);};
    const chkPg=(y,n)=>{if(y+(n||8)>280){doc.addPage();pdfHeader();return 52;}return y;};

    const pdfHeader=()=>{
      doc.setFillColor(...ltblue); doc.rect(0,0,210,46,"F");
      try{if(LOGO_B64)doc.addImage(LOGO_B64,"PNG",10,3,38,38);}catch(e){}
      doc.setDrawColor(...steel); doc.setLineWidth(0.4); doc.line(52,6,52,40);
      doc.setFontSize(12); doc.setFont("helvetica","bold"); doc.setTextColor(...navy);
      doc.text(seller.name,57,13);
      const cnW=TW(seller.name,12);
      doc.setDrawColor(...gold); doc.setLineWidth(0.6); doc.line(57,14.5,57+cnW,14.5);
      doc.setFontSize(7); doc.setFont("helvetica","italic"); doc.setTextColor(...steel);
      doc.text(seller.tagline||"",57,18.5);
      doc.setFont("helvetica","normal"); doc.setTextColor(0,0,0); doc.setFontSize(6.5);
      doc.text(seller.address,57,23);
      doc.text((seller.phone||"")+(seller.email?"  |  "+seller.email:""),57,27.5);
      if(seller.gstin) doc.text(seller.gstin,57,32);
      doc.setTextColor(0,0,0);
    };

    const pdfFooter=()=>{
      const tp=doc.getNumberOfPages();
      for(let i=1;i<=tp;i++){
        doc.setPage(i);
        doc.setFillColor(...navy); doc.rect(0,288,210,9,"F");
        doc.setFontSize(6.5); doc.setFont("helvetica","normal"); doc.setTextColor(...white);
        doc.text(seller.name+"  |  "+seller.phone+"  |  "+seller.email,105,293,{align:"center"});
        doc.setFont("helvetica","bold"); doc.setTextColor(220,220,220);
        doc.text("Page "+i+" of "+tp,M+RW-2,293,{align:"right"});
      }
    };

    // ── PAGE 1 ────────────────────────────────────────────────────────────────
    pdfHeader();
    let y=50;

    // Title
    NF(true,10); doc.setTextColor(...navy);
    doc.text("APPLICATION FOR EXPORT BILL COLLECTION",105,y,{align:"center"});
    doc.setTextColor(0,0,0); y+=8;

    // Date + address
    NF(false,9);
    doc.text("Date: "+f.date,M,y); y+=5.5;
    doc.text("The Branch Head State Bank of India",M,y); y+=5;
    doc.text("Industrial Finance Branch, YN Road, Indore",M,y); y+=7;
    doc.text("Dear Sir / Madam,",M,y); y+=7;

    // Subject
    NF(true,9); doc.text("Submission of Export Documents for Collection",M,y); y+=5;
    NF(false,9); doc.text("I/We submit the following export documents to be sent on collection as detailed below \u2013",M,y); y+=6;

    // Exporter / Importer table — dynamic height
    const eiCols=[90,RW-90];
    NF(false,8);
    const buyerLines=doc.splitTextToSize((f.buyer_name+(f.buyer_address?" "+f.buyer_address:"")).trim(),eiCols[1]-3);
    const eiH=Math.max(20,buyerLines.length*4+8);
    RECT(M,y,eiCols[0],eiH); RECT(M+eiCols[0],y,eiCols[1],eiH);
    NF(true,8); doc.text("Exporter's (Drawer) Name & Address :",M+1,y+4);
    NF(false,8);
    doc.text("DEVRATAN ENTERPRISES LLP",M+1,y+9);
    const expAddr="206, Indore Trade Centre, Madhumulan Square, Indore-452001, M.P.";
    const expAddrL=doc.splitTextToSize(expAddr,eiCols[0]-3);
    doc.text(expAddrL,M+1,y+13);
    doc.text("IEC: AARFD8883D",M+1,y+13+expAddrL.length*4);
    NF(true,8); doc.text("Importer's (Drawee) Name & Address :",M+eiCols[0]+1,y+4);
    NF(false,8);
    const buyerName=doc.splitTextToSize(f.buyer_name,eiCols[1]-3);
    const buyerAddr=doc.splitTextToSize(f.buyer_address||"",eiCols[1]-3);
    doc.text(buyerName,M+eiCols[0]+1,y+9);
    if(f.buyer_address) doc.text(buyerAddr,M+eiCols[0]+1,y+9+buyerName.length*4);
    y+=eiH+4;

    // Bill Details
    NF(true,9); doc.text("Bill Details:",M,y); y+=4;
    const c0=8,c1=68,c2=5,c3=RW-c0-c1-c2;
    NF(false,8.5);

    // Row a: Bill Type — checkboxes inline
    {
      const rh=7;
      RECT(M,y,c0,rh); RECT(M+c0,y,c1,rh); RECT(M+c0+c1,y,c2,rh); RECT(M+c0+c1+c2,y,c3,rh);
      doc.text("a.",M+1,y+4.5);
      NF(true,8.5); doc.text("Bill Type",M+c0+1,y+4.5); NF(false,8.5);
      doc.text(":",M+c0+c1+1,y+4.5);
      const btX=M+c0+c1+c2+2;
      const opts=[["Under LC","Under LC"],["Non LC","Non LC"]];
      let ox=btX;
      opts.forEach(([lbl,val])=>{
        const chk=f.bill_type===val?"[X]":"[ ]";
        doc.text(chk+" "+lbl,ox,y+4.5); ox+=TW(chk+" "+lbl,8.5)+8;
      });
      y+=rh;
    }

    // Row b: Type of Export
    {
      const rh=7;
      RECT(M,y,c0,rh); RECT(M+c0,y,c1,rh); RECT(M+c0+c1,y,c2,rh); RECT(M+c0+c1+c2,y,c3,rh);
      doc.text("b.",M+1,y+4.5);
      NF(true,8.5); doc.text("Type of Export",M+c0+1,y+4.5); NF(false,8.5);
      doc.text(":",M+c0+c1+1,y+4.5);
      const opts=[["Regular","Regular"],["Deemed","Deemed"],["Consignment","Consignment"],["Merchanting Trade","Merchanting Trade"]];
      let ox=M+c0+c1+c2+2;
      opts.forEach(([lbl,val])=>{
        const chk=f.export_type===val?"[X]":"[ ]";
        doc.text(chk+" "+lbl,ox,y+4.5); ox+=TW(chk+" "+lbl,8.5)+6;
      });
      y+=rh;
    }

    // Row c: Nature of Export
    {
      const rh=7;
      RECT(M,y,c0,rh); RECT(M+c0,y,c1,rh); RECT(M+c0+c1,y,c2,rh); RECT(M+c0+c1+c2,y,c3,rh);
      doc.text("c.",M+1,y+4.5);
      NF(true,8.5); doc.text("Nature of Export",M+c0+1,y+4.5); NF(false,8.5);
      doc.text(":",M+c0+c1+1,y+4.5);
      const opts=[["Goods","Goods"],["Software","Software"],["Services","Services"],["Miscellaneous","Miscellaneous"]];
      let ox=M+c0+c1+c2+2;
      opts.forEach(([lbl,val])=>{
        const chk=f.nature===val?"[X]":"[ ]";
        doc.text(chk+" "+lbl,ox,y+4.5); ox+=TW(chk+" "+lbl,8.5)+5;
      });
      y+=rh;
    }

    // Row d: Bill Amount
    {
      const rh=7;
      RECT(M,y,c0,rh); RECT(M+c0,y,c1,rh); RECT(M+c0+c1,y,c2,rh); RECT(M+c0+c1+c2,y,c3,rh);
      doc.text("d.",M+1,y+4.5);
      NF(true,8.5); doc.text("Bill Amount",M+c0+1,y+4.5); NF(false,8.5);
      doc.text(":",M+c0+c1+1,y+4.5);
      NF(true,8.5); doc.text(f.bill_ccy+" "+f.bill_amount,M+c0+c1+c2+2,y+4.5);
      NF(false,8.5);
      y+=rh;
    }

    // Row e: Terms of Payment
    {
      const rh=7;
      RECT(M,y,c0,rh); RECT(M+c0,y,c1,rh); RECT(M+c0+c1,y,c2,rh); RECT(M+c0+c1+c2,y,c3,rh);
      doc.text("e.",M+1,y+4.5);
      NF(true,8.5); doc.text("Terms of Payment",M+c0+1,y+4.5); NF(false,8.5);
      doc.text(":",M+c0+c1+1,y+4.5);
      const opts=[["Sight","Sight"],["Usance","Usance"],["Mixed Payment","Mixed Payment"]];
      let ox=M+c0+c1+c2+2;
      opts.forEach(([lbl,val])=>{
        const chk=f.payment_terms===val?"[X]":"[ ]";
        doc.text(chk+" "+lbl,ox,y+4.5); ox+=TW(chk+" "+lbl,8.5)+6;
      });
      y+=rh;
    }

    // Row f: Advance Remittance Ref — dynamic height
    {
      const lbl="Advance Remittance Ref. No. / e FIRC No. (If applicable)";
      const lls=doc.splitTextToSize(lbl,c1-2);
      const rh=Math.max(7,lls.length*4+3);
      RECT(M,y,c0,rh); RECT(M+c0,y,c1,rh); RECT(M+c0+c1,y,c2,rh); RECT(M+c0+c1+c2,y,c3,rh);
      doc.text("f.",M+1,y+4.5);
      NF(true,8); doc.text(lls,M+c0+1,y+4);
      NF(false,8.5); doc.text(":",M+c0+c1+1,y+4.5);
      doc.text(f.adv_ref_no||"",M+c0+c1+c2+2,y+4.5);
      y+=rh;
    }
    y+=3;

    // Documents Submitted table
    NF(true,8.5); doc.text("Documents Submitted: (Number of Original / Copies of each document submitted)",M,y); y+=4;
    // Documents table — use autoTable for proper fitting
    const docHdrsTbl=["Docs","Bill of Exch / Draft","Commercial Invoice","Transport Doc (BL/AWB)","Packing List","Insur. Policy","Cert. of Origin","Test Cert.","Others"];
    const docKeys0=["doc_orig_bill","doc_orig_invoice","doc_orig_transport","doc_orig_packing","doc_orig_insurance","doc_orig_coo","doc_orig_test","doc_orig_others"];
    const docKeys1=["doc_dup_bill","doc_dup_invoice","doc_dup_transport","doc_dup_packing","doc_dup_insurance","doc_dup_coo","doc_dup_test","doc_dup_others"];
    doc.autoTable({
      startY:y, margin:{left:M,right:M}, tableWidth:RW,
      head:[docHdrsTbl.map(h=>({content:h,styles:{halign:"center",fontSize:6.5,cellPadding:{top:1.5,bottom:1.5,left:1,right:1}}}))],
      body:[
        [["Original"],...docKeys0.map(k=>f[k]||"")],
        [["Duplicate"],...docKeys1.map(k=>f[k]||"")],
      ],
      styles:{fontSize:7.5,cellPadding:{top:2,bottom:2,left:2,right:2},lineColor:[80,80,80],lineWidth:0.2},
      columnStyles:{0:{fontStyle:"bold",cellWidth:20}},
      headStyles:{fillColor:[240,245,255],textColor:[18,52,96],fontStyle:"bold"},
      tableLineColor:[80,80,80],tableLineWidth:0.2,
    });
    y=doc.lastAutoTable.finalY+2;
    NF(false,7.5);
    y=WRAP("A set of all the applicable documents as mentioned above has been enclosed for Bank's record.",M,y+2,RW,4);
    y+=3;

    // Invoice / SB / LC details
    const refCols=[55,RW-55];
    const refRows=[
      ["Invoice No. & Date", (f.invoice_no||"")+(f.invoice_date?" Dated "+f.invoice_date:"")],
      ["Shipping Bill / Softex No. & Date", (f.sb_no||"")+(f.sb_date?" Dated "+f.sb_date:"")],
      ["Details of LC* (Incl. LC Advising Ref. No., if already advised by SBI) [Original LC & Amendments (if any) to be enclosed]", f.lc_details||""],
    ];
    NF(false,8.5);
    refRows.forEach(([lbl,val])=>{
      const lls=doc.splitTextToSize(lbl,refCols[0]-2);
      const vls=doc.splitTextToSize(String(val||""),refCols[1]-2);
      const rh=Math.max(lls.length,vls.length)*4+3;
      y=chkPg(y,rh);
      RECT(M,y,refCols[0],rh); RECT(M+refCols[0],y,refCols[1],rh);
      doc.text(lls,M+1,y+4); doc.text(vls,M+refCols[0]+1,y+4);
      y+=rh;
    });
    NF(false,7);
    y=WRAP("* In the case of documentary collection, Bank will not examine complying status of documents, against the LC",M,y+2,RW,3.8);
    y+=4;

    // Despatch Details
    y=chkPg(y,30);
    NF(true,9); doc.text("Despatch Details [Details of Drawee, i.e. Buyer / Bank to which the Documents are to be sent]:",M,y,{maxWidth:RW}); y+=5;
    const despCols=[40,RW-40];
    [["Name",f.dispatch_name],["Address (with ZIP code)",f.dispatch_address],["SWIFT Code",f.dispatch_swift],["Contact Person details (if required)",f.dispatch_contact]].forEach(([lbl,val])=>{
      const lls=doc.splitTextToSize(lbl,despCols[0]-2);
      const vls=doc.splitTextToSize(String(val||""),despCols[1]-2);
      const rh=Math.max(lls.length,vls.length)*4+3;
      y=chkPg(y,rh);
      RECT(M,y,despCols[0],rh); RECT(M+despCols[0],y,despCols[1],rh);
      NF(false,8.5); doc.text(lls,M+1,y+4); doc.text(vls,M+despCols[0]+1,y+4);
      y+=rh;
    });
    y+=3;

    // Bank Charges
    y=chkPg(y,20);
    NF(false,8.5);
    const bcY=y;
    const bcCols=[50,50,80];
    RECT(M,y,bcCols[0],6); RECT(M+bcCols[0],y,bcCols[1],6); RECT(M+bcCols[0]+bcCols[1],y,bcCols[2],6);
    NF(true,8); doc.text("Bank Charges (Tick applicable)",M+1,y+4);
    NF(false,8.5); doc.text("Inside India",M+bcCols[0]+1,y+4);
    doc.text("Our a/c: "+(f.charges_india==="Our a/c"?"[X]":"[ ]")+"  Their a/c: "+(f.charges_india==="Their a/c"?"[X]":"[ ]"),M+bcCols[0]+bcCols[1]+1,y+4);
    y+=6;
    RECT(M,y,bcCols[0],6); RECT(M+bcCols[0],y,bcCols[1],6); RECT(M+bcCols[0]+bcCols[1],y,bcCols[2],6);
    doc.text("",M+1,y+4);
    doc.text("Outside India",M+bcCols[0]+1,y+4);
    doc.text("Our a/c: "+(f.charges_outside==="Our a/c"?"[X]":"[ ]")+"  Their a/c: "+(f.charges_outside==="Their a/c"?"[X]":"[ ]"),M+bcCols[0]+bcCols[1]+1,y+4);
    y+=12;

    // Additional Information
    y=chkPg(y,40);
    NF(true,9); doc.text("Additional Information:",M,y); y+=5;
    NF(false,8.5);
    y=WRAP("4.  If Merchanting Trade: Import Leg details - Shipment Date ________________________, Txn. Ref. No. ______",M+5,y,RW-5,4.5);
    y+=4;
    y=WRAP("5.  If documents are submitted after 21 days from the date of export, reasons for delay: "+(f.late_reason||""),M+5,y,RW-5,4.5);
    y+=4;
    const tpChk=f.third_party==="Yes";
    doc.text("Is Remitter of Funds a Third Party:  Yes: "+(tpChk?"[X]":"[ ]")+"     No: "+(tpChk?"[ ]":"[X]"),M+5,y); y+=5;
    NF(false,7.5); y=WRAP("(* If Yes, Third Party's name must be mentioned/declared in the Shipping Bill / Softex and Commercial Invoice / Tripartite Agreement)",M+5,y,RW-5,3.8); y+=4;
    NF(false,8.5);
    y=WRAP("The relative charges along with applicable taxes (if any) may please be recovered from our Cash Credit / Current Account No. "+f.charges_account+".",M+5,y,RW-5,4.5);
    y+=4;
    y=WRAP("Special Instructions, if any: "+(f.special_instructions||""),M+5,y,RW-5,4.5);
    y+=5;

    // Contact table
    y=chkPg(y,32);
    RECT(M,y,RW,6); NF(true,8.5); doc.setTextColor(...navy);
    doc.text("Contact Person Details for this transaction:",M+2,y+4);
    y+=6; doc.setTextColor(0,0,0);
    [["Name",":",f.contact_name],["Mobile No.",":",f.contact_mobile],["Email ID",":",f.contact_email]].forEach(([l,c2,v])=>{
      RECT(M,y,50,5); RECT(M+50,y,5,5); RECT(M+55,y,RW-55,5);
      NF(false,8.5); doc.text(l,M+1,y+3.5); doc.text(c2,M+51,y+3.5); doc.text(String(v||""),M+56,y+3.5);
      y+=5;
    });
    y+=12;

    // Sign block
    y=chkPg(y,14);
    NF(true,9);
    doc.text("Date: "+f.date,M,y); doc.text("Authorised Signatory",M+RW-45,y); y+=5;
    doc.text("Place: "+f.place,M,y); y+=6;
    NF(false,8); doc.text("(Please affix Company/Firm Stamp)",M+RW-65,y);

    // ── PAGE 2: TERMS & CONDITIONS ────────────────────────────────────────────
    doc.addPage(); pdfHeader();
    y=50;
    NF(true,9.5); doc.setTextColor(...navy);
    doc.text("TERMS & CONDITIONS",105,y,{align:"center"});
    doc.setTextColor(0,0,0); y+=7;

    NF(true,8.5); doc.text("I / We hereby undertake and declare/confirm/certify that:",M,y); y+=6;
    NF(true,8.5); doc.text("Section - A (FEMA Declaration):",M,y); y+=4;
    NF(false,7.5); y=WRAP("(Under Section10 (5), Chapter III of The Foreign Exchange Management Act, 1999)",M+3,y,RW-3,3.8); y+=3;

    const secA=[
      "1. The transaction mentioned in this application does not contravene the provisions of the Foreign Exchange Management Act 1999 (FEMA) and rules/regulations made thereunder.",
      "2. I/We hereby declare that the transaction, the details of which are specifically mentioned in this application does not involve and is not designed for the purpose of any contravention or evasion of the provisions of the aforesaid act of any rule, regulation, notification, direction, or order made thereunder.",
      "3. I/We also hereby agree and undertake to give such information/documents as may be reasonably required by you to your satisfaction about this transaction in terms of the above declaration.",
      "4. I/We also understand that if I/we refuse to comply with any such requirements or make only unsatisfactory compliance therewith, the Bank shall refuse to undertake the transaction and shall, if it has reason to believe that any contravention / evasion is contemplated by me/us, report the matter to Reserve Bank of India.",
      "5. I/We further declare that the undersigned has/have the authority to give this declaration and undertaking on behalf of the Firm/ Company.",
    ];
    NF(false,7.5);
    secA.forEach(item=>{const ls=doc.splitTextToSize(item,RW-8);doc.text(ls,M+4,y);y+=ls.length*3.8+1.5;});
    y+=3;

    NF(true,8.5); doc.text("Section - B (General declaration):",M,y); y+=5;
    const secB=[
      "1. I/We confirm that we have not availed any pre-shipment credit against the Order(s) covered under this subject Bill*.",
      "2. I/We confirm that pricing is in consonance with prevailing international prices.",
      "3. I/We undertake to comply with all regulations and guidelines issued by RBI, DGFT, Customs authorities, FEDAI, ICC, SBI, EXIM and any other regulatory/government agency/ies from time to time.",
      "4. I/we also declare that the transaction does not have linkage with any Specially Designated Nationals and Blocked Persons (SDN)/countries listed under applicable sanctions laws (as imposed by US-OFAC, UN, EU, or any Other Government and/or Regulatory authorities) in any manner. If the transaction involves linkage with any Specially Designated Nationals and Blocked Persons (SDN)/countries listed under applicable sanctions laws in any manner, I/we undertake not to hold State Bank of India (SBI) responsible for any of its action or inaction in respect of such transactions.",
      "5. I/We hereby provide my/our consent to (State Bank of India i.e. the Bank or its successor or assignee) to share with external agencies (either manually/physically or electronically/digitally) certain information furnished by me/us (including but not limited to HSN/SAC Code/ IE Code/Counterparty details/ Bill of Lading/ other Transaction details and documents) for the purpose of due diligence.",
    ];
    NF(false,7.5);
    secB.forEach(item=>{const ls=doc.splitTextToSize(item,RW-8);y=chkPg(y,ls.length*4);doc.text(ls,M+4,y);y+=ls.length*3.8+1.5;});
    y+=3;
    NF(false,7);
    y=WRAP("* (If pre-shipment credit has been availed against the order covered under the subject bill, such pre-shipment finance to be liquidated by availing post shipment finance against the subject bill or with other export proceeds, immediately)",M,y,RW,3.6);
    y+=10;

    // Sign block
    NF(true,9);
    doc.text("Date: "+f.date,M,y); doc.text("Authorised Signatory (ies)",M+RW-55,y); y+=5;
    doc.text("Place: "+f.place,M,y); y+=6;
    NF(false,8); doc.text("(Please affix Company/Firm Stamp)",M+RW-65,y);

    pdfFooter();
    doc.save("SBI_Export_Bill_Collection_Form.pdf");
  };

  // ── FORM UI ───────────────────────────────────────────────────────────────
  const DateInput=({value,onChange})=>(
    <input type="date" value={toISO(value)}
      onChange={e=>onChange(toDisplay(e.target.value))}
      style={{...iS,fontSize:12}}/>
  );

  return(
    <div style={{background:"#fff",borderRadius:12,padding:20,boxShadow:"0 1px 4px rgba(0,0,0,0.07)"}}>
      <h3 style={{margin:"0 0 4px",color:"#1e3a5f",fontSize:15}}>📤 Application for Export Bill Collection</h3>
      <p style={{margin:"0 0 16px",fontSize:11,color:"#64748b"}}>SBI Industrial Finance Branch, YN Road, Indore</p>

      <SectionHeader title="Basic Details"/>
      <FRow label="Date" required><DateInput value={f.date} onChange={v=>sf("date",v)}/></FRow>

      <SectionHeader title="Importer (Drawee) Details"/>
      <FRow label="Buyer / Importer Name" required><FInput value={f.buyer_name} onChange={v=>sf("buyer_name",v)}/></FRow>
      <FRow label="Buyer Address"><FTextarea value={f.buyer_address} onChange={v=>sf("buyer_address",v)}/></FRow>

      <SectionHeader title="Bill Details"/>
      <FRow label="Bill Type">
        <div style={{display:"flex",gap:10}}>
          {["Under LC","Non LC"].map(opt=>(
            <label key={opt} style={{display:"flex",alignItems:"center",gap:6,fontSize:12,cursor:"pointer",
              padding:"6px 14px",border:`2px solid ${f.bill_type===opt?"#1e3a5f":"#e2e8f0"}`,
              borderRadius:6,background:f.bill_type===opt?"#eff6ff":"#f8fafc",fontWeight:f.bill_type===opt?700:400}}>
              <input type="radio" name="bill_type" checked={f.bill_type===opt} onChange={()=>sf("bill_type",opt)} style={{accentColor:"#1e3a5f"}}/>{opt}
            </label>
          ))}
        </div>
      </FRow>
      <FRow label="Type of Export">
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
          {["Regular","Deemed","Consignment","Merchanting Trade"].map(opt=>(
            <label key={opt} style={{display:"flex",alignItems:"center",gap:6,fontSize:12,cursor:"pointer",
              padding:"6px 10px",border:`2px solid ${f.export_type===opt?"#1e3a5f":"#e2e8f0"}`,
              borderRadius:6,background:f.export_type===opt?"#eff6ff":"#f8fafc",fontWeight:f.export_type===opt?700:400}}>
              <input type="radio" name="export_type" checked={f.export_type===opt} onChange={()=>sf("export_type",opt)} style={{accentColor:"#1e3a5f"}}/>{opt}
            </label>
          ))}
        </div>
      </FRow>
      <FRow label="Nature of Export">
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
          {["Goods","Software","Services","Miscellaneous"].map(opt=>(
            <label key={opt} style={{display:"flex",alignItems:"center",gap:6,fontSize:12,cursor:"pointer",
              padding:"6px 10px",border:`2px solid ${f.nature===opt?"#1e3a5f":"#e2e8f0"}`,
              borderRadius:6,background:f.nature===opt?"#eff6ff":"#f8fafc",fontWeight:f.nature===opt?700:400}}>
              <input type="radio" name="nature" checked={f.nature===opt} onChange={()=>sf("nature",opt)} style={{accentColor:"#1e3a5f"}}/>{opt}
            </label>
          ))}
        </div>
      </FRow>
      <FRow label="Bill Amount" required>
        <div style={{display:"flex",gap:6}}>
          <select value={f.bill_ccy} onChange={e=>sf("bill_ccy",e.target.value)} style={{...iS,width:90,fontSize:12}}>
            {["USD","EUR","GBP","JPY","AED","SGD","AUD","CNY"].map(c=><option key={c}>{c}</option>)}
          </select>
          <FInput value={f.bill_amount} onChange={v=>sf("bill_amount",v)} placeholder="e.g. 12555.00"/>
        </div>
      </FRow>
      <FRow label="Terms of Payment">
        <div style={{display:"flex",gap:10}}>
          {["Sight","Usance","Mixed Payment"].map(opt=>(
            <label key={opt} style={{display:"flex",alignItems:"center",gap:6,fontSize:12,cursor:"pointer",
              padding:"6px 14px",border:`2px solid ${f.payment_terms===opt?"#1e3a5f":"#e2e8f0"}`,
              borderRadius:6,background:f.payment_terms===opt?"#eff6ff":"#f8fafc",fontWeight:f.payment_terms===opt?700:400}}>
              <input type="radio" name="payment_terms" checked={f.payment_terms===opt} onChange={()=>sf("payment_terms",opt)} style={{accentColor:"#1e3a5f"}}/>{opt}
            </label>
          ))}
        </div>
      </FRow>
      <FRow label="Advance Remittance Ref. No. / e-FIRC No."><FInput value={f.adv_ref_no} onChange={v=>sf("adv_ref_no",v)} placeholder="If applicable"/></FRow>

      <SectionHeader title="Documents Submitted (No. of Originals / Copies)"/>
      <div style={{overflowX:"auto",marginBottom:8}}>
        <table style={{borderCollapse:"collapse",fontSize:11,minWidth:600}}>
          <thead>
            <tr>
              <th style={{border:"1px solid #e2e8f0",padding:"5px 6px",background:"#f1f5f9",minWidth:70}}>Type</th>
              {["Bill of Exchange","Commercial Invoice","Transport Doc","Packing List","Insurance Policy","Cert. of Origin","Test Cert.","Others"].map(h=>(
                <th key={h} style={{border:"1px solid #e2e8f0",padding:"5px 6px",background:"#f1f5f9",textAlign:"center",minWidth:55,fontSize:10}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[["Original",["doc_orig_bill","doc_orig_invoice","doc_orig_transport","doc_orig_packing","doc_orig_insurance","doc_orig_coo","doc_orig_test","doc_orig_others"]],
              ["Duplicate",["doc_dup_bill","doc_dup_invoice","doc_dup_transport","doc_dup_packing","doc_dup_insurance","doc_dup_coo","doc_dup_test","doc_dup_others"]]
            ].map(([row,keys])=>(
              <tr key={row}>
                <td style={{border:"1px solid #e2e8f0",padding:"4px 6px",fontWeight:600}}>{row}</td>
                {keys.map(k=>(
                  <td key={k} style={{border:"1px solid #e2e8f0",padding:3}}>
                    <input value={f[k]} onChange={e=>sf(k,e.target.value)} style={{...iS,fontSize:11,textAlign:"center",width:40}}/>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SectionHeader title="Invoice & Shipping Bill Details"/>
      <FRow label="Invoice No." required><FInput value={f.invoice_no} onChange={v=>sf("invoice_no",v)}/></FRow>
      <FRow label="Invoice Date" required><DateInput value={f.invoice_date} onChange={v=>sf("invoice_date",v)}/></FRow>
      <FRow label="Shipping Bill / Softex No." required><FInput value={f.sb_no} onChange={v=>sf("sb_no",v)}/></FRow>
      <FRow label="Shipping Bill Date"><DateInput value={f.sb_date} onChange={v=>sf("sb_date",v)}/></FRow>
      <FRow label="LC Details (if applicable)"><FInput value={f.lc_details} onChange={v=>sf("lc_details",v)} placeholder="LC No., Advising Ref. No."/></FRow>

      <SectionHeader title="Despatch Details"/>
      <FRow label="Name"><FInput value={f.dispatch_name} onChange={v=>sf("dispatch_name",v)}/></FRow>
      <FRow label="Address (with ZIP code)"><FTextarea value={f.dispatch_address} onChange={v=>sf("dispatch_address",v)}/></FRow>
      <FRow label="SWIFT Code"><FInput value={f.dispatch_swift} onChange={v=>sf("dispatch_swift",v)}/></FRow>
      <FRow label="Contact Person"><FInput value={f.dispatch_contact} onChange={v=>sf("dispatch_contact",v)}/></FRow>

      <SectionHeader title="Bank Charges"/>
      <FRow label="Inside India">
        <div style={{display:"flex",gap:10}}>
          {["Our a/c","Their a/c"].map(opt=>(
            <label key={opt} style={{display:"flex",alignItems:"center",gap:6,fontSize:12,cursor:"pointer",
              padding:"6px 14px",border:`2px solid ${f.charges_india===opt?"#1e3a5f":"#e2e8f0"}`,
              borderRadius:6,background:f.charges_india===opt?"#eff6ff":"#f8fafc",fontWeight:f.charges_india===opt?700:400}}>
              <input type="radio" name="chrg_india" checked={f.charges_india===opt} onChange={()=>sf("charges_india",opt)} style={{accentColor:"#1e3a5f"}}/>{opt}
            </label>
          ))}
        </div>
      </FRow>
      <FRow label="Outside India">
        <div style={{display:"flex",gap:10}}>
          {["Our a/c","Their a/c"].map(opt=>(
            <label key={opt} style={{display:"flex",alignItems:"center",gap:6,fontSize:12,cursor:"pointer",
              padding:"6px 14px",border:`2px solid ${f.charges_outside===opt?"#1e3a5f":"#e2e8f0"}`,
              borderRadius:6,background:f.charges_outside===opt?"#eff6ff":"#f8fafc",fontWeight:f.charges_outside===opt?700:400}}>
              <input type="radio" name="chrg_outside" checked={f.charges_outside===opt} onChange={()=>sf("charges_outside",opt)} style={{accentColor:"#1e3a5f"}}/>{opt}
            </label>
          ))}
        </div>
      </FRow>

      <SectionHeader title="Additional Information"/>
      {f.export_type==="Merchanting Trade"&&(
        <div style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:8,padding:"10px 14px",marginBottom:10,fontSize:12}}>
          <div style={{fontWeight:700,color:"#92400e",marginBottom:8}}>Merchanting Trade Details</div>
          <FRow label="Import Leg Shipment Date"><input type="date" value={f.mt_shipdate} onChange={e=>sf("mt_shipdate",e.target.value)} style={{...iS,fontSize:12}}/></FRow>
          <FRow label="Txn. Ref. No."><FInput value={f.mt_txn_ref} onChange={v=>sf("mt_txn_ref",v)}/></FRow>
        </div>
      )}
      <FRow label="Reason for delay (if > 21 days)"><FInput value={f.late_reason} onChange={v=>sf("late_reason",v)}/></FRow>
      <FRow label="Is Remitter a Third Party?">
        <div style={{display:"flex",gap:10}}>
          {["Yes","No"].map(opt=>(
            <label key={opt} style={{display:"flex",alignItems:"center",gap:6,fontSize:12,cursor:"pointer",
              padding:"6px 14px",border:`2px solid ${f.third_party===opt?"#1e3a5f":"#e2e8f0"}`,
              borderRadius:6,background:f.third_party===opt?"#eff6ff":"#f8fafc",fontWeight:f.third_party===opt?700:400}}>
              <input type="radio" name="third_party" checked={f.third_party===opt} onChange={()=>sf("third_party",opt)} style={{accentColor:"#1e3a5f"}}/>{opt}
            </label>
          ))}
        </div>
      </FRow>
      <FRow label="Charges from A/c No."><FInput value={f.charges_account} onChange={v=>sf("charges_account",v)}/></FRow>
      <FRow label="Special Instructions"><FTextarea value={f.special_instructions} onChange={v=>sf("special_instructions",v)}/></FRow>

      <SectionHeader title="Contact Details"/>
      <FRow label="Name"><FInput value={f.contact_name} onChange={v=>sf("contact_name",v)}/></FRow>
      <FRow label="Mobile No."><FInput value={f.contact_mobile} onChange={v=>sf("contact_mobile",v)}/></FRow>
      <FRow label="Email"><FInput value={f.contact_email} onChange={v=>sf("contact_email",v)}/></FRow>
      <FRow label="Place"><FInput value={f.place} onChange={v=>sf("place",v)}/></FRow>

      <div style={{marginTop:14,padding:"8px 12px",background:"#f0fdf4",borderRadius:8,fontSize:11,color:"#15803d"}}>
        📄 PDF: Page 1 — Application Form &nbsp;|&nbsp; Page 2 — Terms &amp; Conditions (Section A &amp; B)
      </div>
      <div style={{display:"flex",gap:10,marginTop:12,justifyContent:"flex-end"}}>
        <button onClick={exportPDF}
          style={{background:"linear-gradient(135deg,#15803d,#16a34a)",color:"#fff",border:"none",
                  borderRadius:8,padding:"8px 20px",cursor:"pointer",fontWeight:700,fontSize:13}}>
          📄 Export PDF
        </button>
      </div>
    </div>
  );
}



function FormA2({ships}){
  const today=new Date().toLocaleDateString("en-IN",{day:"2-digit",month:"2-digit",year:"numeric"}).replace(/\//g,".");
  const toDisplay=iso=>{if(!iso)return"";const[y,m,d]=iso.split("-");return`${d}.${m}.${y}`;};
  const toISO=dd=>{if(!dd||!dd.includes("."))return"";const[d,m,y]=dd.split(".");return`${y}-${m}-${d}`;};

  const [f,setF]=useState({
    date:today,
    applicant_name:"Devratan Enterprises LLP",
    applicant_address:"Off No 206, 2nd Floor, Indore Trade Center, Madhumilan Square, Indore MP 452001",
    account_no:"41289547389",
    amount_ccy:"USD", amount:"",
    purpose:"", purpose_code:"S0204",
    charges:"OUR",
    remittance_type:"direct",  // "draft" | "direct" | "tc" | "notes"
    beneficiary_name:"",
    beneficiary_address:"",
    bank_name:"",
    bank_address:"",
    account_number:"",
    swift_code:"",
    declarant_name:"AKSHAY MITTAL",
  });
  const sf=(k,v)=>setF(p=>({...p,[k]:v}));

  const exportPDF=()=>{
    const JPDF=getPDF(); if(!JPDF) return;
    const doc=new JPDF({orientation:"portrait",unit:"mm",format:"a4"});
    const M=20, RW=170; // wider margins for plain A4
    const NF=(bold,sz)=>{doc.setFont("helvetica",bold?"bold":"normal");doc.setFontSize(sz||9);doc.setTextColor(0,0,0);};
    const TW=(t,sz)=>doc.getStringUnitWidth(String(t))*(sz||9)/doc.internal.scaleFactor;
    const WRAP=(t,x,y,mw,lh)=>{const ls=doc.splitTextToSize(String(t||""),mw);doc.text(ls,x,y);return y+ls.length*(lh||4.5);};
    const RECT=(x,y,w,h)=>{doc.setDrawColor(80,80,80);doc.setLineWidth(0.2);doc.rect(x,y,w,h);};
    const LINE=(x1,y1,x2,y2)=>{doc.setDrawColor(80,80,80);doc.setLineWidth(0.3);doc.line(x1,y1,x2,y2);};
    const chkPg=(y,n)=>{if(y+(n||8)>282){doc.addPage();return 20;}return y;};
    const pdfFooter=()=>{
      const tp=doc.getNumberOfPages();
      for(let i=1;i<=tp;i++){
        doc.setPage(i);
        NF(false,7.5); doc.setTextColor(120,120,120);
        doc.text("Page "+i+" of "+tp,105,290,{align:"center"});
        doc.setTextColor(0,0,0);
      }
    };

    // ── PAGE 1: APPLICATION ───────────────────────────────────────────────────
    let y=20;

    // Title block
    NF(true,12);
    doc.text("Form A2",M,y); y+=6;
    NF(true,10);
    doc.text("Application cum Declaration",M,y); y+=5;
    NF(false,8.5);
    doc.text("(To be completed by the applicant)",M,y); y+=5;
    NF(true,9);
    doc.text("Application for drawal of foreign exchange",M,y); y+=8;
    LINE(M,y-2,M+RW,y-2);

    // Applicant details
    NF(true,9); doc.text("Details of the applicant -",M,y); y+=6;
    NF(false,9);
    doc.text("Name: "+f.applicant_name,M+5,y); y+=5;
    const addrLines=doc.splitTextToSize("Address: "+f.applicant_address,RW-5);
    doc.text(addrLines,M+5,y); y+=addrLines.length*4.5+2;
    doc.text("Account No.: "+f.account_no,M+5,y); y+=8;
    LINE(M,y-2,M+RW,y-2);

    // Foreign exchange details
    NF(true,9); doc.text("Details of the foreign exchange required",M,y); y+=6;
    NF(false,9);
    // Amount line with bold value
    doc.text("Amount (Specify currency) : ",M+5,y);
    const amtLblW=TW("Amount (Specify currency) : ",9);
    NF(true,9); doc.text(f.amount_ccy+" "+f.amount,M+5+amtLblW,y);
    NF(false,9); y+=5;
    y=WRAP("Purpose: "+f.purpose+(f.purpose_code?" ("+f.purpose_code+")":""),M+5,y,RW-5,4.5);
    y+=2;
    doc.text("CHARGES: "+(f.charges||"OUR"),M+5,y); y+=8;
    LINE(M,y-2,M+RW,y-2);

    // Authorisation
    NF(false,9);
    y=WRAP("I authorise you to debit my Saving Bank / Current / RFC / EEFC Account No. "+f.account_no+" together with your charges and",M,y,RW,4.5);
    y+=5;

    // Options a/b/c/d — with checkmarks
    const opts=[
      {key:"draft",   label:"a) Issue a draft", sub:"Beneficiary's Name: "+(f.remittance_type==="draft"?f.beneficiary_name:"___________________")+"    Address: "+(f.remittance_type==="draft"?f.beneficiary_address:"________________________________")},
      {key:"direct",  label:"b) Effect the foreign exchange remittance directly -", sub:null},
      {key:"tc",      label:"c) Issue travellers cheques for", sub:f.remittance_type==="tc"?f.amount+" "+f.amount_ccy:"_____________________________"},
      {key:"notes",   label:"d) Issue foreign currency notes for", sub:f.remittance_type==="notes"?f.amount+" "+f.amount_ccy:"_________________________"},
    ];
    opts.forEach(opt=>{
      const selected=f.remittance_type===opt.key;
      NF(selected,9);
      const prefix=selected?"* ":"  ";
      if(opt.sub===null){
        doc.text(prefix+opt.label,M+5,y); y+=5;
        // Show beneficiary details for direct remittance
        if(selected){
          NF(false,9);
          doc.text("Beneficiary's Name: "+f.beneficiary_name,M+10,y); y+=5;
          y=WRAP("Name and address of the Bank: "+f.bank_name+(f.bank_address?", "+f.bank_address:""),M+10,y,RW-10,4.5);
          y+=1;
          doc.text("Account No.: "+f.account_number+(f.swift_code?"   SWIFT: "+f.swift_code:""),M+10,y); y+=5;
        } else {
          NF(false,9);
          doc.text("Beneficiary's Name: ___________________",M+10,y); y+=5;
          doc.text("Name and address of the Bank: ___________________________________________",M+10,y); y+=5;
          doc.text("Account No.: ___________________   SWIFT: ___________________",M+10,y); y+=5;
        }
      } else {
        doc.text(prefix+opt.label,M+5,y);
        NF(false,9); doc.text(String(opt.sub||""),M+5+TW(prefix+opt.label,selected?9:9)+2,y);
        y+=5;
      }
    });
    y+=2;
    NF(false,7.5); doc.text("(Strike out whichever is not applicable)",M,y); y+=8;
    LINE(M,y-2,M+RW,y-2);

    // Signature block
    NF(false,9);
    doc.text("Signature: ________________________________",M,y); y+=8;
    LINE(M,y-2,M+RW,y-2);

    // Declaration
    NF(true,9); doc.text("Declaration",M,y); y+=5;
    NF(false,8.5); doc.text("(Under FEMA 1999)",M,y); y+=6;
    NF(false,9);
    doc.text("I, "+f.applicant_name+" declare that -",M,y); y+=6;
    y=WRAP("The total amount of foreign exchange purchased from or remitted through, all sources in India during this calendar year including this application is within "+f.amount_ccy+" the annual limit prescribed by Reserve Bank of India for the said purpose.",M+5,y,RW-5,4.5);
    y+=4;
    doc.text("Foreign exchange purchased from you is for the purpose indicated above.",M+5,y); y+=5;
    NF(false,7.5); doc.text("(Strike out whichever is not applicable)",M,y); y+=8;

    // Sign / Date / Name
    NF(false,9);
    doc.text("Signature: ________________________________",M,y);
    doc.text("Date: "+f.date,M+RW-30,y); y+=6;
    doc.text("Name: "+f.declarant_name,M,y); y+=8;
    LINE(M,y-2,M+RW,y-2);

    // AD / Bank section (to be filled by bank)
    NF(true,8.5); doc.text("(To be filled in by Authorised Dealer)",M,y); y+=6;
    NF(false,8.5);
    doc.text("AD Code No.: ________________________________",M,y); y+=5;
    doc.text("Form No.: ________________________________",M,y); y+=5;
    doc.text("Currency: ________________    Amount: ________________    Equivalent to Rs.: _______________",M,y); y+=8;
    LINE(M,y-2,M+RW,y-2);

    // Purpose code note
    NF(false,7.5);
    y=WRAP("ADs should put a tick (\u2713) against an appropriate purpose code. (In case of doubt/difficulty, consult customer/RBI.)",M,y,RW,3.8);
    y+=4;

    // ── Purpose Code Table ────────────────────────────────────────────────────
    const purposeCodes=[
      ["Capital Account Transactions (00)","",""],
      ["S0001","Indian investment abroad in equity capital (shares)",""],
      ["S0002","Indian investment abroad in debt securities",""],
      ["S0003","Indian investment abroad in branches",""],
      ["S0004","Indian investment abroad in subsidiaries and associates",""],
      ["S0005","Indian investment abroad in real estate",""],
      ["S0006","Repatriation of Foreign Direct Investment in India - in equity shares",""],
      ["S0007","Repatriation of Foreign Direct Investment in India - in debt securities",""],
      ["S0008","Repatriation of Foreign Direct Investment in India in real estate",""],
      ["S0009","Repatriation of Foreign Portfolio Investment in India in equity shares",""],
      ["S0010","Repatriation of Foreign Portfolio Investment in India in debt securities",""],
      ["S0011","Loans extended to Non-Residents",""],
      ["S0012","Repayment of long and medium-term loans with original maturity above one year received from Non-Residents.",""],
      ["S0013","Repayment of short-term loans with original maturity up to one year received from Non-Residents.",""],
      ["S0014","Repatriation of Non-Resident Deposits (FCNRB/NRERA etc)",""],
      ["S0015","Repayment of loans & overdrafts taken by ADs on their own account.",""],
      ["S0016","Sale of a foreign currency against another foreign currency",""],
      ["S0017","Purchase of intangible assets like patents, copyrights, trade marks etc.",""],
      ["S0018","Other capital payments not included elsewhere",""],
      ["Transportation (02)","",""],
      ["S0201","Payments for surplus freight/passenger fare by foreign shipping companies operating in India.",""],
      ["S0202","Payment for operating expenses of Indian shipping companies operating abroad.",""],
      ["S0203","Freight on imports - Shipping companies",""],
      ["S0204","Freight on exports - Shipping companies",""],
      ["S0205","Operational leasing (with crew) - Shipping companies",""],
      ["S0206","Booking of passages abroad - Shipping companies",""],
      ["S0207","Payments for surplus freight/passenger fare by foreign Airlines companies operating in India.",""],
      ["S0208","Operating expenses of Indian Airlines companies operating abroad",""],
      ["S0209","Freight on imports - Airlines companies",""],
      ["S0210","Freight on exports - Airlines companies",""],
      ["S0211","Operational leasing (with crew) - Airlines companies",""],
      ["S0212","Booking of passages abroad - Airlines companies",""],
      ["S0213","Payments on account of stevedoring, demurrage, port handling charges etc.",""],
      ["Travel (03)","",""],
      ["S0301","Remittance towards Business travel.",""],
      ["S0302","Travel under basic travel quota (BTQ)",""],
      ["S0303","Travel for pilgrimage",""],
      ["S0304","Travel for medical treatment",""],
      ["S0305","Travel for education (including fees, hostel expenses etc.)",""],
      ["S0306","Other travel (international credit cards)",""],
      ["Communication Services (04)","",""],
      ["S0401","Postal services",""],
      ["S0402","Courier services",""],
      ["S0403","Telecommunication services",""],
      ["S0404","Satellite services",""],
      ["Construction Services (05)","",""],
      ["S0501","Construction of projects abroad by Indian companies including import of goods at project site",""],
      ["S0502","Payments for cost of construction etc. of projects executed by foreign companies in India.",""],
      ["Insurance Services (06)","",""],
      ["S0601","Payments for Life insurance premium",""],
      ["S0602","Freight insurance - relating to import & export of goods",""],
      ["S0603","Other general insurance premium",""],
      ["S0604","Reinsurance premium",""],
      ["S0605","Auxiliary services (commission on insurance)",""],
      ["S0606","Settlement of claims",""],
      ["Financial Services (07)","",""],
      ["S0701","Financial intermediation except investment banking - Bank charges, collection charges, LC charges, cancellation of forward contracts, commission on financial leasing etc.",""],
      ["S0702","Investment banking - brokerage, underwriting commission etc.",""],
      ["S0703","Auxiliary services - charges on operation & regulatory fees, custodial services, depository services etc.",""],
      ["Computer and Information Services (08)","",""],
      ["S0801","Hardware consultancy/implementation",""],
      ["S0802","Software consultancy/implementation",""],
      ["S0803","Data base, data processing charges",""],
      ["S0804","Repair and maintenance of computer and software",""],
      ["S0805","News agency services",""],
      ["S0806","Other information services - Subscription to newspapers, periodicals",""],
      ["Royalties and License Fees (09)","",""],
      ["S0901","Franchises services - patents, copyrights, trade marks, industrial processes, franchises etc.",""],
      ["S0902","Payment for use, through licensing arrangements, of produced originals or prototypes (such as manuscripts and films)",""],
      ["Other Business Services (10)","",""],
      ["S1001","Merchanting services - net payments (from Sale & purchase of goods without crossing the border).",""],
      ["S1002","Trade related services - commission on exports / imports",""],
      ["S1003","Operational leasing services (other than financial leasing) without operating crew, including charter hire",""],
      ["S1004","Legal services",""],
      ["S1005","Accounting, auditing, book keeping and tax consulting services",""],
      ["S1006","Business and management consultancy and public relations services",""],
      ["S1007","Advertising, trade fair, market research and public opinion polling service",""],
      ["S1008","Research & Development services",""],
      ["S1009","Architectural, engineering and other technical services",""],
      ["S1010","Agricultural, mining and on-site processing services",""],
      ["S1011","Payments for maintenance of offices abroad",""],
      ["S1012","Distribution services",""],
      ["S1013","Environmental services",""],
      ["S1019","Other services not included elsewhere",""],
      ["Personal, Cultural and Recreational Services (11)","",""],
      ["S1101","Audio-visual and related services",""],
      ["S1102","Personal, cultural services such as those related to museums, libraries, archives and sporting activities",""],
      ["Government n.i.e. (12)","",""],
      ["S1201","Maintenance of Indian embassies abroad",""],
      ["S1202","Remittances by foreign embassies in India",""],
      ["Transfers (13)","",""],
      ["S1301","Remittance by non-residents towards family maintenance and savings",""],
      ["S1302","Remittance towards personal gifts and donations",""],
      ["S1303","Remittance towards donations to religious and charitable institutions abroad",""],
      ["S1304","Remittance towards grants and donations to other governments and charitable institutions established by the governments.",""],
      ["S1305","Contributions/donations by the Government to international institutions",""],
      ["S1306","Remittance towards payment / refund of taxes.",""],
      ["Income (14)","",""],
      ["S1401","Compensation of employees",""],
      ["S1402","Remittance towards interest on Non-Resident deposits (FCNRB/NRERA/NRNRD/NRSR etc.)",""],
      ["S1403","Remittance towards interest on loans from Non-Residents (ST/MT/LT loans)",""],
      ["S1404","Remittance of interest on debt securities - debentures/bonds/FRNs etc.",""],
      ["S1405","Remittance towards interest payment by ADs on their own account",""],
      ["S1406","Repatriation of profits",""],
      ["S1407","Payment/repatriation of dividends",""],
      ["Others (15)","",""],
      ["S1501","Refunds/rebates/reduction in invoice value on account of exports",""],
      ["S1502","Reversal of wrong entries, refunds of amount remitted for non exports",""],
      ["S1503","Payments by residents for international bidding",""],
      ["S1504","Notional sales when export bills negotiated/purchased/discounted are dishonoured/crystallized/cancelled",""],
    ];

    // Build autoTable body — category rows as headers, code rows as data
    const tableRows=[];
    purposeCodes.forEach(([code,desc])=>{
      const isCategory=!code.startsWith("S");
      const isSel=code===f.purpose_code;
      tableRows.push({code,desc,isCategory,isSel});
    });

    doc.autoTable({
      startY:y, margin:{left:M,right:M}, tableWidth:RW,
      body:tableRows.map(r=>{
        if(r.isCategory) return [{content:r.code,colSpan:3,styles:{fontStyle:"bold",fillColor:[220,235,250],textColor:[18,52,96],fontSize:8}}];
        return[
          {content:r.isSel?"\u2713":"",styles:{halign:"center",fontStyle:"bold",textColor:[0,100,0],fontSize:10}},
          {content:r.code,styles:{fontStyle:r.isSel?"bold":"normal",textColor:r.isSel?[0,100,0]:[0,0,0],fontSize:7.5}},
          {content:r.desc,styles:{fontStyle:r.isSel?"bold":"normal",textColor:r.isSel?[0,100,0]:[0,0,0],fontSize:7.5}},
        ];
      }),
      styles:{cellPadding:{top:1.5,bottom:1.5,left:2,right:2},lineColor:[160,160,160],lineWidth:0.15},
      columnStyles:{0:{cellWidth:8,halign:"center"},1:{cellWidth:18},2:{cellWidth:RW-26}},
      tableLineColor:[120,120,120],tableLineWidth:0.2,
    });

    pdfFooter();
    doc.save("SBI_Form_A2.pdf");
  };

  const DateInput=({value,onChange})=>(
    <input type="date" value={toISO(value)} onChange={e=>onChange(toDisplay(e.target.value))} style={{...iS,fontSize:12}}/>
  );

  return(
    <div style={{background:"#fff",borderRadius:12,padding:20,boxShadow:"0 1px 4px rgba(0,0,0,0.07)"}}>
      <h3 style={{margin:"0 0 4px",color:"#1e3a5f",fontSize:15}}>📋 Form A2 — Application for Drawal of Foreign Exchange</h3>
      <p style={{margin:"0 0 16px",fontSize:11,color:"#64748b"}}>Plain A4 format — no header/footer · Purpose code table auto-printed on page 2</p>

      <SectionHeader title="Applicant Details"/>
      <FRow label="Date" required><DateInput value={f.date} onChange={v=>sf("date",v)}/></FRow>
      <FRow label="Applicant Name"><FInput value={f.applicant_name} onChange={v=>sf("applicant_name",v)}/></FRow>
      <FRow label="Address"><FTextarea value={f.applicant_address} onChange={v=>sf("applicant_address",v)}/></FRow>
      <FRow label="Account No."><FInput value={f.account_no} onChange={v=>sf("account_no",v)}/></FRow>

      <SectionHeader title="Foreign Exchange Details"/>
      <FRow label="Amount in FCY" required>
        <div style={{display:"flex",gap:6}}>
          <select value={f.amount_ccy} onChange={e=>sf("amount_ccy",e.target.value)} style={{...iS,width:90,fontSize:12}}>
            {["USD","EUR","GBP","JPY","AED","SGD","AUD","CNY"].map(c=><option key={c}>{c}</option>)}
          </select>
          <FInput value={f.amount} onChange={v=>sf("amount",v)} placeholder="e.g. 2187.00"/>
        </div>
      </FRow>
      <FRow label="Purpose" required><FInput value={f.purpose} onChange={v=>sf("purpose",v)} placeholder="e.g. EXPORT OCEAN FREIGHT PAYMENT"/></FRow>
      <FRow label="Purpose Code"><FInput value={f.purpose_code} onChange={v=>sf("purpose_code",v)} placeholder="e.g. S0204"/></FRow>
      <FRow label="Charges">
        <div style={{display:"flex",gap:10}}>
          {["OUR","BEN","SHA"].map(opt=>(
            <label key={opt} style={{display:"flex",alignItems:"center",gap:6,fontSize:12,cursor:"pointer",
              padding:"6px 14px",border:`2px solid ${f.charges===opt?"#1e3a5f":"#e2e8f0"}`,
              borderRadius:6,background:f.charges===opt?"#eff6ff":"#f8fafc",fontWeight:f.charges===opt?700:400}}>
              <input type="radio" name="charges" checked={f.charges===opt} onChange={()=>sf("charges",opt)} style={{accentColor:"#1e3a5f"}}/>{opt}
            </label>
          ))}
        </div>
      </FRow>

      <SectionHeader title="Remittance Type"/>
      <FRow label="Type">
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
          {[["draft","a) Issue a draft"],["direct","b) Direct remittance"],["tc","c) Travellers cheques"],["notes","d) Foreign currency notes"]].map(([val,lbl])=>(
            <label key={val} style={{display:"flex",alignItems:"center",gap:6,fontSize:12,cursor:"pointer",
              padding:"6px 10px",border:`2px solid ${f.remittance_type===val?"#1e3a5f":"#e2e8f0"}`,
              borderRadius:6,background:f.remittance_type===val?"#eff6ff":"#f8fafc",fontWeight:f.remittance_type===val?700:400}}>
              <input type="radio" name="remit_type" checked={f.remittance_type===val} onChange={()=>sf("remittance_type",val)} style={{accentColor:"#1e3a5f"}}/>
              {lbl}
            </label>
          ))}
        </div>
      </FRow>

      {(f.remittance_type==="draft"||f.remittance_type==="direct")&&(
        <>
          <SectionHeader title="Beneficiary Details"/>
          <FRow label="Beneficiary Name" required><FInput value={f.beneficiary_name} onChange={v=>sf("beneficiary_name",v)}/></FRow>
          <FRow label="Beneficiary Address"><FTextarea value={f.beneficiary_address} onChange={v=>sf("beneficiary_address",v)}/></FRow>
          {f.remittance_type==="direct"&&<>
            <FRow label="Bank Name" required><FInput value={f.bank_name} onChange={v=>sf("bank_name",v)}/></FRow>
            <FRow label="Bank Address"><FTextarea value={f.bank_address} onChange={v=>sf("bank_address",v)}/></FRow>
            <FRow label="Account Number" required><FInput value={f.account_number} onChange={v=>sf("account_number",v)}/></FRow>
            <FRow label="SWIFT Code"><FInput value={f.swift_code} onChange={v=>sf("swift_code",v)}/></FRow>
          </>}
        </>
      )}

      <SectionHeader title="Declaration"/>
      <FRow label="Name of Declarant"><FInput value={f.declarant_name} onChange={v=>sf("declarant_name",v)}/></FRow>

      <div style={{marginTop:14,padding:"8px 12px",background:"#f0fdf4",borderRadius:8,fontSize:11,color:"#15803d"}}>
        📄 PDF: Page 1 — Application form · Page 2+ — Purpose Code table (selected code <strong>{f.purpose_code}</strong> highlighted in green ✓)
      </div>
      <div style={{display:"flex",gap:10,marginTop:12,justifyContent:"flex-end"}}>
        <button onClick={exportPDF}
          style={{background:"linear-gradient(135deg,#15803d,#16a34a)",color:"#fff",border:"none",
                  borderRadius:8,padding:"8px 20px",cursor:"pointer",fontWeight:700,fontSize:13}}>
          📄 Export PDF
        </button>
      </div>
    </div>
  );
}



function FreightPaymentForm({ships}){
  const today=new Date().toLocaleDateString("en-IN",{day:"2-digit",month:"2-digit",year:"numeric"}).replace(/\//g,".");
  const [f,setF]=useState({
    date:today,
    goods_description:"EXPORT OCEAN FREIGHT PAYMENT",
    invoice_no:"", invoice_date:"",
    amount_ccy:"USD", amount:"",
    supplier_name:"", supplier_address:"",
    expected_date:"",
    invoice_amount:"", payment_term:"IMMEDIATE", remittance_amount:"",
    beneficiary_name:"", beneficiary_address:"", beneficiary_account:"",
    bank_name:"", bank_address:"", bank_account:"", bank_swift:"",
    intermediary_bank:"N.A.", intermediary_swift:"",
    debit_account:"41289547389",
    sb_no:"", sb_date:"",
    deduction_amount:"", deduction_reason:"credits available with the beneficiary",
    place:"Indore",
  });
  const sf=(k,v)=>setF(p=>({...p,[k]:v}));

  const exportPDF=()=>{
    const JPDF=getPDF(); if(!JPDF) return;
    const doc=new JPDF({orientation:"portrait",unit:"mm",format:"a4"});
    const M=15,pw=180,navy=[18,52,96],steel=[70,130,180],lgray=[235,243,252],gold=[162,120,50],white=[255,255,255],dgray=[180,192,208];
    let y=bankingPdfHeader(doc,"FREIGHT PAYMENT",`Date: ${f.date}`);
    doc.setFontSize(10); doc.setFont(undefined,"bold"); doc.setTextColor(...navy);
    doc.text("Annexure-B",M,y+4); y+=10;
    doc.setFontSize(8.5); doc.setFont(undefined,"normal"); doc.setTextColor(30,30,30);
    doc.text(`Date: ${f.date}`,M+pw-40,y,{align:"right"}); y+=6;
    doc.text("To,",M,y); y+=5;
    doc.text("The Assistant General Manager, State Bank of India",M,y); y+=5;
    doc.text("SBI KHEL Prashal, Y.N. Road, Indore",M,y); y+=5;
    doc.text("Madam / Dear Sir,",M,y); y+=7;
    doc.setFont(undefined,"bold");
    doc.text("Subject: Undertaking-cum-Declaration for processing of outward remittance",M,y,{maxWidth:pw}); y+=8;
    doc.setFont(undefined,"normal");
    doc.text(`I/We, Devratan Enterprises LLP, having registered office at Off No 206, 2nd Floor, Indore Trade Center, Indore-452001, hereby request you to process the import payment by debit to Account No. ${f.debit_account}.`,M,y,{maxWidth:pw}); y+=14;
    doc.setFont(undefined,"bold"); doc.text("Details of Import:",M,y); y+=6;
    doc.setFont(undefined,"normal");
    doc.text(`a) Description of Goods/Services: ${f.goods_description}`,M,y,{maxWidth:pw}); y+=5;
    doc.text(`b) Invoice Number & Date: ${f.invoice_no} dated ${f.invoice_date}`,M,y,{maxWidth:pw}); y+=5;
    doc.text(`c) Currency & Amount: ${f.amount_ccy} ${f.amount}`,M,y); y+=5;
    doc.text(`d) Supplier's Name and Address: ${f.supplier_name}`,M,y,{maxWidth:pw}); y+=5;
    doc.text(`e) Expected date of receipt: ${f.expected_date}`,M,y); y+=8;
    doc.autoTable({
      startY:y,margin:{left:M,right:M},tableWidth:pw,
      body:[
        ["Beneficiary/Seller's Invoice No.",`${f.invoice_no} dated ${f.invoice_date}`],
        ["Invoice Amount",`${f.amount_ccy} ${f.invoice_amount}`],
        ["Payment Term",f.payment_term],
        ["Amount of Remittance",`${f.amount_ccy} ${f.remittance_amount}`],
      ],
      styles:{fontSize:8.5,cellPadding:{top:3,bottom:3,left:5,right:5},lineColor:dgray,lineWidth:0.3},
      columnStyles:{0:{cellWidth:70,fillColor:lgray,fontStyle:"bold",textColor:navy}},
      tableLineColor:gold,tableLineWidth:0.4,
    });
    y=doc.lastAutoTable.finalY+4;
    doc.autoTable({
      startY:y,margin:{left:M,right:M},tableWidth:pw,
      body:[
        [{content:"(1) Beneficiary Details",colSpan:2,styles:{fontStyle:"bold",fillColor:[220,235,250],textColor:navy,fontSize:8.5}}],
        ["Name",f.beneficiary_name],
        ["Address",f.beneficiary_address],
        ["Account Number",f.beneficiary_account],
        [{content:"(2) Account with Institution",colSpan:2,styles:{fontStyle:"bold",fillColor:[220,235,250],textColor:navy,fontSize:8.5}}],
        ["Bank Name",f.bank_name],
        ["Address",f.bank_address],
        ["Account Number",f.bank_account],
        ["SWIFT Code",f.bank_swift],
        [{content:"(3) Intermediary Bank",colSpan:2,styles:{fontStyle:"bold",fillColor:[220,235,250],textColor:navy,fontSize:8.5}}],
        ["Intermediary Bank",f.intermediary_bank],
        ["SWIFT Code",f.intermediary_swift||"N.A."],
      ],
      styles:{fontSize:8.5,cellPadding:{top:3,bottom:3,left:5,right:5},lineColor:dgray,lineWidth:0.3},
      columnStyles:{0:{cellWidth:70,fillColor:lgray}},
      tableLineColor:steel,tableLineWidth:0.4,
    });
    y=doc.lastAutoTable.finalY+5;
    if(y>260){doc.addPage();bankingPdfHeader(doc,"FREIGHT PAYMENT (cont.)","");y=52;}
    doc.setFontSize(8.5); doc.setFont(undefined,"bold"); doc.setTextColor(...navy);
    doc.text("Undertaking & Declaration:",M,y); y+=6;
    doc.setFont(undefined,"normal"); doc.setTextColor(30,30,30);
    doc.text(`THE SUFFICIENT BALANCE / D.P. ARE AVAILABLE IN OUR A/C NO. ${f.debit_account} AND THE BANK IS AUTHORIZED TO DEBIT THE SAID A/C FOR REMITTING THE FUNDS BY SWIFT MODE.`,M,y,{maxWidth:pw}); y+=10;
    const declarations = [
      "We confirm that the transaction does not involve countries under US OFAC / EU / UN comprehensive / targeted sanctions.",
      "We confirm that no third party remittance is involved in said transaction.",
      "We confirm that the transaction does not involve Merchanting Trade Transaction.",
      `We confirm that we have not made payment of this freight amount of ${f.amount_ccy} ${f.remittance_amount} from any other bank under the Shipping Bill No. ${f.sb_no} dated ${f.sb_date}.`,
    ];
    declarations.forEach(d=>{doc.text("- "+d,M,y,{maxWidth:pw}); y+=8;});
    if(f.deduction_amount){
      doc.text(`- The Invoice amount is ${f.amount_ccy} ${f.invoice_amount}, from which we have deducted an amount of ${f.amount_ccy} ${f.deduction_amount} towards ${f.deduction_reason} and the balance payment of ${f.amount_ccy} ${f.remittance_amount} is being done now.`,M,y,{maxWidth:pw}); y+=10;
    }
    doc.text("Yours faithfully,",M,y); y+=10;
    doc.setFont(undefined,"bold"); doc.text("For DEVRATAN ENTERPRISES LLP",M,y); y+=8;
    doc.text("Authorised Signatory",M,y);
    bankingPdfFooter(doc);
    doc.save("SBI_Freight_Payment_Form.pdf");
  };

  const exportWord=async()=>{
    const docx=getDocx(); if(!docx) return;
    const {Document,Packer,Paragraph,TextRun,AlignmentType,Header,Footer} = docx;
    const p=(text,opts={})=>new Paragraph({spacing:{before:opts.before||60,after:opts.after||60},alignment:opts.align||AlignmentType.LEFT,children:[new TextRun({text:String(text||""),bold:!!opts.bold,size:opts.size||18,font:"Arial",color:opts.color||"111111"})]});
    const doc2=new Document({sections:[{properties:{page:{size:{width:11906,height:16838},margin:{top:900,right:900,bottom:1000,left:900}}},headers:{default:new Header({children:[p("DEVRATAN ENTERPRISES LLP   |   SBI FREIGHT PAYMENT UNDERTAKING",{size:15,color:"123458"})]})},footers:{default:new Footer({children:[p("Off No 206, 2nd Floor, Indore Trade Center, Indore MP 452001   |   +91-9111282828   |   akshay@devratan.com",{size:14,color:"555555",align:AlignmentType.CENTER})]})},children:[
      p("Annexure-B",{bold:true,after:60}),
      p(`Date: ${f.date}`,{after:80}),
      p("To, The Assistant General Manager, State Bank Of India, SBI KHEL Prashal, Y.N Road, Indore",{after:80}),
      p("Madam / Dear Sir,",{after:80}),
      p("Subject: Undertaking-cum-Declaration for processing of outward remittance",{bold:true,after:80}),
      p(`I/We, Devratan Enterprises LLP, having registered office at Off No 206, 2nd Floor, Indore Trade Center, Indore-452001, hereby request you to process the import payment by debit to Account No. ${f.debit_account}.`,{after:120}),
      p("Details of Import:",{bold:true,after:80}),
      p(`a) Description: ${f.goods_description}`,{after:60}),
      p(`b) Invoice No. & Date: ${f.invoice_no} dated ${f.invoice_date}`,{after:60}),
      p(`c) Currency & Amount: ${f.amount_ccy} ${f.amount}`,{after:60}),
      p(`d) Supplier: ${f.supplier_name}`,{after:60}),
      p(`e) Expected Date: ${f.expected_date}`,{after:120}),
      p(`Invoice Amount: ${f.amount_ccy} ${f.invoice_amount}     Payment Term: ${f.payment_term}     Amount of Remittance: ${f.amount_ccy} ${f.remittance_amount}`,{after:120}),
      p("(1) Beneficiary Details:",{bold:true,after:80}),
      p(`Name: ${f.beneficiary_name}     A/c: ${f.beneficiary_account}`,{after:60}),
      p(`Address: ${f.beneficiary_address}`,{after:120}),
      p("(2) Account with Institution:",{bold:true,after:80}),
      p(`${f.bank_name}     ${f.bank_address}`,{after:60}),
      p(`A/c: ${f.bank_account}     SWIFT: ${f.bank_swift}`,{after:120}),
      p("(3) Intermediary Bank: "+f.intermediary_bank+"     SWIFT: "+(f.intermediary_swift||"N.A."),{after:120}),
      p(`THE SUFFICIENT BALANCE/D.P. ARE AVAILABLE IN OUR A/C NO. ${f.debit_account} AND THE BANK IS AUTHORIZED TO DEBIT THE SAID A/C FOR REMITTING THE FUNDS BY SWIFT MODE.`,{bold:true,after:120}),
      p(`- We confirm that the transaction does not involve countries under US OFAC/EU/UN sanctions.`,{after:60}),
      p(`- We confirm that no third party remittance is involved.`,{after:60}),
      p(`- We confirm that we have not made payment of ${f.amount_ccy} ${f.remittance_amount} from any other bank under SB No. ${f.sb_no} dated ${f.sb_date}.`,{after:60}),
      ...(f.deduction_amount?[p(`- Invoice amount ${f.amount_ccy} ${f.invoice_amount}, deduction ${f.amount_ccy} ${f.deduction_amount} towards ${f.deduction_reason}, balance payment ${f.amount_ccy} ${f.remittance_amount}.`,{after:120})]: []),
      p("Yours faithfully,",{after:160}),
      p("For DEVRATAN ENTERPRISES LLP",{bold:true,after:60}),
      p("Authorised Signatory",{bold:true}),
    ]}]});
    const blob=await Packer.toBlob(doc2);
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a"); a.href=url; a.download="SBI_Freight_Payment_Form.docx";
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  return(
    <div style={{background:"#fff",borderRadius:12,padding:20,boxShadow:"0 1px 4px rgba(0,0,0,0.07)"}}>
      <h3 style={{margin:"0 0 4px",color:"#1e3a5f",fontSize:15}}>🚢 Annexure-B — Freight Payment Undertaking</h3>
      <p style={{margin:"0 0 16px",fontSize:11,color:"#64748b"}}>Undertaking-cum-Declaration for processing of outward remittance</p>
      <SectionHeader title="Basic Details"/>
      <FRow label="Date"><FInput value={f.date} onChange={v=>sf("date",v)}/></FRow>
      <FRow label="Debit Account No."><FInput value={f.debit_account} onChange={v=>sf("debit_account",v)}/></FRow>
      <SectionHeader title="Import Details"/>
      <FRow label="Description of Goods/Services" required><FInput value={f.goods_description} onChange={v=>sf("goods_description",v)}/></FRow>
      <FRow label="Invoice Number" required><FInput value={f.invoice_no} onChange={v=>sf("invoice_no",v)}/></FRow>
      <FRow label="Invoice Date"><FInput value={f.invoice_date} onChange={v=>sf("invoice_date",v)} placeholder="e.g. 06.06.2026"/></FRow>
      <FRow label="Currency"><select value={f.amount_ccy} onChange={e=>sf("amount_ccy",e.target.value)} style={iS}>{["USD","EUR","GBP"].map(c=><option key={c}>{c}</option>)}</select></FRow>
      <FRow label="Amount" required><FInput value={f.amount} onChange={v=>sf("amount",v)} placeholder="e.g. 2187.00"/></FRow>
      <FRow label="Supplier Name" required><FInput value={f.supplier_name} onChange={v=>sf("supplier_name",v)}/></FRow>
      <FRow label="Supplier Address"><FTextarea value={f.supplier_address} onChange={v=>sf("supplier_address",v)}/></FRow>
      <FRow label="Expected Date"><FInput value={f.expected_date} onChange={v=>sf("expected_date",v)} placeholder="e.g. 01.06.2026"/></FRow>
      <SectionHeader title="Payment Details"/>
      <FRow label="Invoice Amount"><FInput value={f.invoice_amount} onChange={v=>sf("invoice_amount",v)}/></FRow>
      <FRow label="Payment Term"><FInput value={f.payment_term} onChange={v=>sf("payment_term",v)}/></FRow>
      <FRow label="Amount of Remittance" required><FInput value={f.remittance_amount} onChange={v=>sf("remittance_amount",v)}/></FRow>
      <FRow label="Deduction Amount (if any)"><FInput value={f.deduction_amount} onChange={v=>sf("deduction_amount",v)} placeholder="Leave blank if none"/></FRow>
      <FRow label="Deduction Reason"><FInput value={f.deduction_reason} onChange={v=>sf("deduction_reason",v)}/></FRow>
      <SectionHeader title="Beneficiary Details"/>
      <FRow label="Beneficiary Name" required><FInput value={f.beneficiary_name} onChange={v=>sf("beneficiary_name",v)}/></FRow>
      <FRow label="Beneficiary Address"><FTextarea value={f.beneficiary_address} onChange={v=>sf("beneficiary_address",v)}/></FRow>
      <FRow label="Beneficiary Account No." required><FInput value={f.beneficiary_account} onChange={v=>sf("beneficiary_account",v)}/></FRow>
      <SectionHeader title="Beneficiary's Bank Details"/>
      <FRow label="Bank Name" required><FInput value={f.bank_name} onChange={v=>sf("bank_name",v)}/></FRow>
      <FRow label="Bank Address"><FTextarea value={f.bank_address} onChange={v=>sf("bank_address",v)}/></FRow>
      <FRow label="Bank Account No."><FInput value={f.bank_account} onChange={v=>sf("bank_account",v)}/></FRow>
      <FRow label="SWIFT Code" required><FInput value={f.bank_swift} onChange={v=>sf("bank_swift",v)}/></FRow>
      <FRow label="Intermediary Bank"><FInput value={f.intermediary_bank} onChange={v=>sf("intermediary_bank",v)}/></FRow>
      <FRow label="Intermediary SWIFT"><FInput value={f.intermediary_swift} onChange={v=>sf("intermediary_swift",v)}/></FRow>
      <SectionHeader title="Shipping Bill Reference"/>
      <FRow label="Shipping Bill No." required><FInput value={f.sb_no} onChange={v=>sf("sb_no",v)}/></FRow>
      <FRow label="Shipping Bill Date"><FInput value={f.sb_date} onChange={v=>sf("sb_date",v)} placeholder="e.g. 19.05.2026"/></FRow>
      <FRow label="Place"><FInput value={f.place} onChange={v=>sf("place",v)}/></FRow>
      <ExportButtons onPDF={exportPDF} onWord={exportWord}/>
    </div>
  );
}


// ─── Banking Forms ────────────────────────────────────────────────────────────
function bankingPdfHeader(doc, title, subtitle) {
  const M=15, pw=180;
  const navy=[18,52,96], steel=[70,130,180], ltblue=[220,235,250], gold=[162,120,50], white=[255,255,255];
  const seller = COMPANIES.devratan;
  doc.setFillColor(...ltblue); doc.rect(0,0,210,46,"F");
  try{if(LOGO_B64)doc.addImage(LOGO_B64,"PNG",10,3,38,38);}catch(e){}
  doc.setDrawColor(...steel); doc.setLineWidth(0.4); doc.line(52,6,52,40);
  doc.setFontSize(12); doc.setFont(undefined,"bold"); doc.setTextColor(...navy);
  doc.text(seller.name,57,13);
  const cnW=doc.getTextWidth(seller.name);
  doc.setDrawColor(...gold); doc.setLineWidth(0.6); doc.line(57,14.5,57+cnW,14.5);
  doc.setFontSize(7); doc.setFont(undefined,"italic"); doc.setTextColor(...steel);
  doc.text(seller.tagline||"",57,18.5);
  doc.setFont(undefined,"normal"); doc.setTextColor(...navy); doc.setFontSize(6.5);
  doc.text(seller.address,57,23);
  doc.text((seller.phone||"")+(seller.email?"   |   "+seller.email:""),57,27.5);
  if(seller.gstin) doc.text(seller.gstin,57,32);
  doc.setFontSize(14); doc.setFont(undefined,"bold"); doc.setTextColor(...navy);
  doc.text(title,210-M,12,{align:"right"});
  if(subtitle){doc.setFontSize(8);doc.setFont(undefined,"normal");doc.setTextColor(...steel);doc.text(subtitle,210-M,19,{align:"right"});}
  return 52;
}
function bankingPdfFooter(doc){
  const navy=[18,52,96],gold=[162,120,50],white=[255,255,255];
  const M=15,pw=180,seller=COMPANIES.devratan;
  const tp=doc.getNumberOfPages();
  for(let i=1;i<=tp;i++){
    doc.setPage(i);
    doc.setFillColor(...navy); doc.rect(0,290,210,7,"F");
    doc.setFontSize(6.5); doc.setFont(undefined,"normal"); doc.setTextColor(...white);
    doc.text(seller.name+"   |   "+seller.phone+"   |   "+seller.email,105,294,{align:"center"});
    doc.setFillColor(...gold); doc.roundedRect(M+pw-18,283,18,7,1.5,1.5,"F");
    doc.setFontSize(7); doc.setFont(undefined,"bold"); doc.setTextColor(...navy);
    doc.text(i+" / "+tp,M+pw-9,287.2,{align:"center"});
  }
}

export default function App(){
  const [session,setSession]=useState(()=>{
    try{
      // Version check — runs before any state is loaded
      const storedVer=localStorage.getItem("app_version");
      if(storedVer && storedVer!==APP_VERSION){
        // New version deployed — wipe session so user must re-login
        localStorage.removeItem("sb_session");
        localStorage.removeItem("sb_user");
        localStorage.setItem("app_version",APP_VERSION);
        return null;
      }
      localStorage.setItem("app_version",APP_VERSION);
      const s=localStorage.getItem("sb_session");
      return s?JSON.parse(s):null;
    }catch{return null;}
  });
  const [userInfo,setUserInfo]=useState(()=>{
    try{
      // If session was wiped above, wipe userInfo too
      if(!localStorage.getItem("sb_session")) return null;
      const u=localStorage.getItem("sb_user");
      return u?JSON.parse(u):null;
    }catch{return null;}
  });
  const [loginForm,setLoginForm]=useState({email:"",password:"",error:"",loading:false});
  const [tab,setTab]=useState("dashboard");
  const [fy,setFy]=useState(CURR_FY);
  const [ships,setShips]=useState([]);
  const [bcs,setBcs]=useState([]);
  const [standaloneIRMs,setStandaloneIRMs]=useState([]);
  const [standaloneBRCs,setStandaloneBRCs]=useState([]);
  const [profits,setProfits]=useState([]);
  const [users,setUsers]=useState([]);
  const [buyers,setBuyers]=useState([]);
  const [contracts,setContracts]=useState([]);
  const [pendings,setPendings]=useState([]);
  const [showApprovals,setShowApprovals]=useState(false);
  const [showBuyerForm,setShowBuyerForm]=useState(false);
  const [editBuyer,setEditBuyer]=useState(null);
  const [showContractForm,setShowContractForm]=useState(false);
  const [piModal,setPiModal]=useState(null); // {contract, buyer} when open
  const [bcSubTab,setBcSubTab]=useState("irm"); // "irm" | "brc" | "bc"


  const [irmDocsModal,setIrmDocsModal]=useState(null);  // irm object
  const [brcDocsModal,setBrcDocsModal]=useState(null);  // brc object
  const [irmModal,setIrmModal]=useState(null);  // null | {irm|null}
  const [brcModal,setBrcModal]=useState(null);  // null | {brc|null}
  const [editContract,setEditContract]=useState(null);
  const [buyerSearch,setBuyerSearch]=useState("");
  const [contractSearch,setContractSearch]=useState("");
  const [shipDocsId,setShipDocsId]=useState(null);
  const [bcDocsId,setBCDocsId]=useState(null);
  const [loading,setLoading]=useState(false);
  const [showShipForm,setShowShipForm]=useState(false);
  const [editShipId,setEditShipId]=useState(null);
  const [resubmitPcId,setResubmitPcId]=useState(null); // pending_changes id being resubmitted
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
  const [colFilters,setColFilters]=useState({});  // {colKey: filterString}
  const [activeFilterCol,setActiveFilterCol]=useState(null); // col showing filter input
  const [saving,setSaving]=useState(false);
  const [exportModal,setExportModal]=useState(null);
  const [showUpdateBanner,setShowUpdateBanner]=useState(false); // "shipments"|"profitability"|"bc"|"dashboard"
  const [dashFilter,setDashFilter]=useState(null); // null|"brc"|"rodtep"|"gst"

  const doLogin=async()=>{
    if(!loginForm.email||!loginForm.password){setLoginForm(f=>({...f,error:"Email and password required."}));return;}
    setLoginForm(f=>({...f,loading:true,error:""}));
    try{
      const data=await authFetch("/auth/v1/token?grant_type=password",{method:"POST",body:JSON.stringify({email:loginForm.email,password:loginForm.password})});
      const uArr=await sb(`users?email=eq.${encodeURIComponent(loginForm.email)}&select=*`);
      const uInfo=uArr[0]||{name:loginForm.email,role:"viewer"};
      localStorage.setItem("sb_session",JSON.stringify(data));
      localStorage.setItem("sb_user",JSON.stringify(uInfo));
      setSession(data);setUserInfo(uInfo);
    }catch(e){setLoginForm(f=>({...f,error:"Invalid email or password.",loading:false}));}
  };

  const doLogout=()=>{localStorage.removeItem("sb_session");localStorage.removeItem("sb_user");setSession(null);setUserInfo(null);setShips([]);setBcs([]);setProfits([]);};

    const loadAll=useCallback(async()=>{
    if(!session)return;
    setLoading(true);
    // Fetch each table independently so one failure doesn't blank the whole app
    const safe=q=>sb(q).catch(e=>{console.warn("Fetch error:",q,e);return[];});
    const[s,b,irm0,brc0,p,u,pc,by,ct]=await Promise.all([
      safe("shipments?select=*&order=invoice_date.desc"),
      safe("bill_collections?select=*,irm_entries(*),brc_entries(*)"),
      safe("irm_entries?bc_id=is.null&select=*"),
      safe("brc_entries?bc_id=is.null&select=*"),
      safe("profitability?select=*&order=created_at.desc"),
      safe("users?select=*&order=name.asc"),
      safe("pending_changes?select=*&order=submitted_at.desc"),
      safe("buyers?select=*&order=buyer_name.asc"),
      safe("contracts?select=*&order=created_at.desc"),
    ]);
    setBcs(b||[]);
    setStandaloneIRMs(irm0||[]);
    setStandaloneBRCs(brc0||[]);
    setShips(s||[]);setProfits(p||[]);setUsers(u||[]);setPendings(pc||[]);setBuyers(by||[]);setContracts(ct||[]);
    setLoading(false);
  },[session]);

  useEffect(()=>{loadAll();},[loadAll]);

  // ── Auto-logout after 30 min idle ──────────────────────────────────────────
  useEffect(()=>{
    if(!session) return;
    let timer;
    const IDLE_MS = 30 * 60 * 1000; // 30 minutes
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        doLogout();
        alert("You have been logged out due to 30 minutes of inactivity.");
      }, IDLE_MS);
    };
    const events = ["mousedown","mousemove","keydown","touchstart","scroll","click"];
    events.forEach(e => window.addEventListener(e, reset, {passive:true}));
    reset(); // start timer
    return () => {
      clearTimeout(timer);
      events.forEach(e => window.removeEventListener(e, reset));
    };
  },[session]);

  // ── Show update banner when new version is deployed ─────────────────────
  useEffect(()=>{
    if(!session) return;
    // Poll index.html every 5 minutes to detect new deployment
    const checkForUpdate = async () => {
      try {
        // Fetch index.html with cache-busting to get fresh copy
        const res = await fetch("/", {headers:{"Cache-Control":"no-cache, no-store"},cache:"no-store"});
        const html = await res.text();
        // Extract APP_VERSION value from the fetched JS bundle reference
        // New deployment = different bundle hash in script src
        const matches = html.match(/static\/js\/main\.[a-z0-9]+\.js/g);
        if(matches && matches[0]){
          const deployedHash = matches[0];
          const storedHash = sessionStorage.getItem("bundle_hash");
          if(storedHash && storedHash !== deployedHash){
            setShowUpdateBanner(true);
          } else if(!storedHash){
            sessionStorage.setItem("bundle_hash", deployedHash);
          }
        }
      } catch(e){ /* silent — offline or blocked */ }
    };
    checkForUpdate();
    const interval = setInterval(checkForUpdate, 5 * 60 * 1000); // every 5 min
    return () => clearInterval(interval);
  },[session]);

  // ── Force logout if user role has been changed by admin ──────────────────
  useEffect(()=>{
    if(!session || !userInfo || !userInfo.id) return;
    const savedRole = userInfo.role;
    const checkRole = async () => {
      try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${userInfo.id}&select=role`,{
          headers:{"apikey":SUPABASE_KEY,"Authorization":`Bearer ${SUPABASE_KEY}`}
        });
        const data = await res.json();
        if(!data||!data[0]) return;
        const freshRole = data[0].role;
        if(freshRole && freshRole !== savedRole){
          localStorage.removeItem("sb_session");
          localStorage.removeItem("sb_user");
          setSession(null);
          setUserInfo(null);
          setShips([]);setBcs([]);setProfits([]);
          alert(`Your role has been updated to "${freshRole}". Please log in again.`);
        }
      } catch(e){ /* silent */ }
    };
    checkRole();
    const interval = setInterval(checkRole, 60000);
    return () => clearInterval(interval);
  },[userInfo?.id]);

  const isAdmin=userInfo&&userInfo.role==="admin";
  const isSeniorAccountant=userInfo&&userInfo.role==="senior_accountant";
  const isJuniorAccountant=userInfo&&userInfo.role==="junior_accountant";
  // junior_accountant can only add shipments (not edit/delete/BC/P&L)
  const canEdit=userInfo&&(isAdmin||isSeniorAccountant||userInfo.role==="accountant"||isJuniorAccountant);
  const canDelete=userInfo&&(isAdmin||isSeniorAccountant||userInfo.role==="accountant");
  const canEditBC=userInfo&&(isAdmin||isSeniorAccountant||userInfo.role==="accountant");
  const canEditPL=userInfo&&(isAdmin||isSeniorAccountant||userInfo.role==="accountant");
  // junior_accountant: can add shipment but NOT edit/delete existing ones
  const canEditShipment=userInfo&&(isAdmin||isSeniorAccountant||userInfo.role==="accountant"||isJuniorAccountant);
  const canAddShipment=userInfo&&(isAdmin||isSeniorAccountant||userInfo.role==="accountant"||isJuniorAccountant);
  const getBC=s=>bcs.find(b=>(b.linked_invoices||[]).includes(s.invoice_no))||null;

  const fyCounts=useMemo(()=>{const c={};ALL_FYS.forEach(f=>c[f]=0);ships.forEach(s=>{const f=getFY(s.invoice_date);if(c[f]!==undefined)c[f]++;});return c;},[ships]);
  const fyShips=useMemo(()=>ships.filter(s=>getFY(s.invoice_date)===fy),[ships,fy]);
  const fyProfits=useMemo(()=>profits.filter(p=>{const s=ships.find(x=>x.invoice_no===p.invoice_no);return s&&getFY(s.invoice_date)===fy;}),[profits,ships,fy]);

  const totals=useMemo(()=>{
    const _brcs=[...bcs.flatMap(b=>b.brc_entries||[]),...standaloneBRCs];
    const _irms=[...bcs.flatMap(b=>b.irm_entries||[]),...standaloneIRMs];
    return fyShips.reduce((a,s)=>{
      const c=calcShip(s);
      const sBRCs=_brcs.filter(b=>b.linked_invoice_no===s.invoice_no);
      const {paidUSD:pU,paidINR:pI}=calcEffectivePaid(s.invoice_no,_brcs,_irms);
      a.count++;a.invUSD+=c.invoiceAmtUSD;a.invINR+=c.invoiceAmtINR;
      a.fobUSD+=n(s.fob_value_usd);a.fobINR+=c.fobValueINR;a.gross+=c.grossTotal;
      a.paidUSD+=pU;a.paidINR+=pI;
      a.bal+=c.invoiceAmtUSD-pU;
      a.brcPend+=sBRCs.length===0?1:0;
      a.rodPend+=s.rodtep_status==="Pending"?1:0;a.gstPend+=s.gst_status==="Pending"?1:0;
      return a;
    },{count:0,invUSD:0,invINR:0,fobUSD:0,fobINR:0,gross:0,paidUSD:0,paidINR:0,bal:0,brcPend:0,rodPend:0,gstPend:0});
  },[fyShips,bcs,standaloneBRCs,standaloneIRMs]);

  const allYears=useMemo(()=>ALL_FYS.map(f=>{const ss=ships.filter(s=>getFY(s.invoice_date)===f);return ss.reduce((a,s)=>{const c=calcShip(s),bc=getBC(s);a.count++;a.inv+=c.invoiceAmtUSD;a.fob+=n(s.fob_value_usd);a.paid+=bc?bc.total_amt_usd:0;a.bal+=bc?c.invoiceAmtUSD-bc.total_amt_usd:c.invoiceAmtUSD;return a;},{fy:f,count:0,inv:0,fob:0,paid:0,bal:0});}), [ships,bcs]);

  const filtered=useMemo(()=>{
    let s=[...fyShips];
    if(dashFilter==="brc") s=s.filter(x=>{const _b=[...bcs.flatMap(b=>b.brc_entries||[]),...standaloneBRCs];return _b.filter(b=>b.linked_invoice_no===x.invoice_no).length===0;});
    if(dashFilter==="rodtep") s=s.filter(x=>x.rodtep_status==="Pending");
    if(dashFilter==="gst") s=s.filter(x=>x.gst_status==="Pending");
    if(search) s=s.filter(x=>Object.values(x).join(" ").toLowerCase().includes(search.toLowerCase()));
    // Column filters
    Object.entries(colFilters).forEach(([col,val])=>{
      if(!val) return;
      const v=val.toLowerCase();
      s=s.filter(x=>{
        // computed cols
        if(col==="bc_no"){ const bc=getBC(x); return (bc?.bc_no||"").toLowerCase().includes(v); }
        if(col==="buyer_country") return (x.buyer_country||"").toLowerCase().includes(v);
        if(col==="rodtep_status") return (x.rodtep_status||"").toLowerCase().includes(v);
        if(col==="gst_status") return (x.gst_status||"").toLowerCase().includes(v);
        if(col==="delivery_terms") return (x.delivery_terms||"").toLowerCase().includes(v);
        return String(x[col]||"").toLowerCase().includes(v);
      });
    });
    s.sort((a,b)=>{let av=a[sortCol],bv=b[sortCol];if(!isNaN(Number(av))){av=Number(av);bv=Number(bv);}return av<bv?(sortDir==="asc"?-1:1):av>bv?(sortDir==="asc"?1:-1):0;});
    return s;
  },[fyShips,search,sortCol,sortDir,dashFilter,bcs,colFilters,standaloneBRCs]);

  const EMPTY_SHIP={invoice_no:"",invoice_date:"",buyer_name:"",buyer_country:"",product:"",port_of_loading:"",port_of_discharge:"",shipping_bill_no:"",shipping_bill_date:"",port_code:"",bl_no:"",bl_date:"",qty:"",rate_per_mt:"",delivery_terms:"CIF",exchange_rate:"",igst:0,fob_value_usd:"",rodtep_amount:"",rodtep_status:"Pending",gst_status:"Pending",bc_id:null,remarks:""};
  const EMPTY_PROFIT={invoice_no:"",invoice_date:"",buyer_name:"",port_of_discharge:"",invoice_amt_inr:0,payment_received_inr:0,rice_purchase_val:"",pp_bags_purchase_val:"",local_transport:"",ocean_freight:"",cha_clearing:"",shipping_line_charges:"",inspect_agency:"",coc_ectn:"",other_exp:""};

  const openAddShip=()=>{setShipForm({...EMPTY_SHIP});setEditShipId(null);setShowShipForm(true);};
  const openEditShip=s=>{setShipForm({...s});setEditShipId(s.id);setShowShipForm(true);};
  const setSF=(k,v)=>setShipForm(f=>({...f,[k]:v}));

  // ── Buyer CRUD ─────────────────────────────────────────────────────────────
  const saveBuyer=async(form)=>{
    if(!form.buyer_name){alert("Buyer name required.");return;}
    setSaving(true);
    try{
      const payload={...form};delete payload.id;delete payload.created_at;
      if(editBuyer){await sb(`buyers?id=eq.${editBuyer.id}`,{method:"PATCH",body:JSON.stringify(payload)});}
      else{await sb("buyers",{method:"POST",body:JSON.stringify(payload)});}
      await loadAll();setShowBuyerForm(false);setEditBuyer(null);
    }catch(e){alert("Error: "+e.message);}
    setSaving(false);
  };

  const deleteBuyer=async(id)=>{
    if(!window.confirm("Delete this buyer?"))return;
    setSaving(true);
    try{await sb(`buyers?id=eq.${id}`,{method:"DELETE"});await loadAll();}
    catch(e){alert("Error: "+e.message);}
    setSaving(false);
  };

  // ── Contract CRUD ───────────────────────────────────────────────────────────
  const saveContract=async(form)=>{
    if(!form.contract_no||!form.buyer_id){alert("Contract No and Buyer are required.");return;}
    setSaving(true);
    try{
      const isJA=isJuniorAccountant;
      const payload={...form,created_by:userInfo?.name,created_by_role:userInfo?.role,
        approval_status:isJA?"pending":"approved"};
      delete payload.id;delete payload.created_at;
      // Normalize items array
      if(payload.items && payload.items.length) {
        payload.items = payload.items.map(it=>({
          ...it,
          quantity_mt: Number(it.quantity_mt)||null,
          container_qty: it.container_qty||"1",
          price_usd: Number(it.price_usd)||null,
        }));
      }
      // Keep legacy fields in sync with first item for backward compatibility
      const firstItem = (payload.items||[])[0]||{};
      payload.quantity_mt = Number(firstItem.quantity_mt)||null;
      payload.container_qty = firstItem.container_qty||null;
      payload.container_type = firstItem.container_type||null;
      payload.price_usd = Number(firstItem.price_usd)||null;
      payload.price_per = firstItem.price_per||"MTs";
      payload.packing = firstItem.packing||null;
      // Convert empty strings to null for UUID fields
      ["buyer_id","consignee_id"].forEach(k=>{
        if(!payload[k]||payload[k]==="") payload[k]=null;
      });
      // Convert empty date to null
      if(!payload.contract_date) payload.contract_date=null;
      if(editContract){
        if(isJA){
          await sb("pending_changes",{method:"POST",body:JSON.stringify({
            action:"edit",table_name:"contracts",record_id:editContract.id,
            new_data:payload,old_data:editContract,
            submitted_by:userInfo.id,submitted_by_name:userInfo.name,status:"pending"
          })});
          alert("Contract edit submitted for approval.");
        } else {
          await sb(`contracts?id=eq.${editContract.id}`,{method:"PATCH",body:JSON.stringify(payload)});
        }
      } else {
        if(isJA){
          await sb("pending_changes",{method:"POST",body:JSON.stringify({
            action:"add",table_name:"contracts",record_id:null,
            new_data:payload,old_data:null,
            submitted_by:userInfo.id,submitted_by_name:userInfo.name,status:"pending"
          })});
          alert("Contract submitted for approval.");
        } else {
          await sb("contracts",{method:"POST",body:JSON.stringify(payload)});
        }
      }
      await loadAll();setShowContractForm(false);setEditContract(null);
    }catch(e){alert("Error: "+e.message);}
    setSaving(false);
  };

  const deleteContract=async(id)=>{
    if(!window.confirm("Delete this contract?"))return;
    setSaving(true);
    try{await sb(`contracts?id=eq.${id}`,{method:"DELETE"});await loadAll();}
    catch(e){alert("Error: "+e.message);}
    setSaving(false);
  };

  const canManageContracts=userInfo&&(isAdmin||isSeniorAccountant||userInfo.role==="accountant"||isJuniorAccountant);
  const canDeleteContracts=userInfo&&(isAdmin||isSeniorAccountant);

  const prepShipPayload=(form)=>{
    const payload={...form};
    delete payload.id;delete payload.created_at;
    ["qty","rate_per_mt","exchange_rate","igst","fob_value_usd","rodtep_amount"].forEach(f=>{if(payload[f]===""||payload[f]===undefined)payload[f]=null;else payload[f]=Number(payload[f])||null;});
    ["invoice_date","shipping_bill_date","bl_date"].forEach(f=>{if(payload[f]===""||payload[f]===undefined)payload[f]=null;});
    return payload;
  };

  const saveShip=async()=>{
    if(!shipForm.invoice_no||!shipForm.buyer_name){alert("Invoice No and Buyer Name required.");return;}
    setSaving(true);
    try{
      const payload=prepShipPayload(shipForm);
      if(isJuniorAccountant){
        // Route through approval workflow
        const action=editShipId?"edit":"add";
        const oldData=editShipId?ships.find(s=>s.id===editShipId):null;
        await sb("pending_changes",{method:"POST",body:JSON.stringify({
          action, table_name:"shipments",
          record_id:editShipId||null,
          new_data:payload,
          old_data:oldData||null,
          submitted_by:userInfo.id,
          submitted_by_name:userInfo.name,
          status:"pending"
        })});
        // If resubmitting a rejected entry, delete the old rejected pending_change
        if(resubmitPcId){
          await sb(`pending_changes?id=eq.${resubmitPcId}`,{method:"DELETE"});
          setResubmitPcId(null);
        }
        await loadAll();setShowShipForm(false);
        alert("✅ Submitted for approval. Your entry will appear once approved by senior accountant or admin.");
      } else {
        if(editShipId){await sb(`shipments?id=eq.${editShipId}`,{method:"PATCH",body:JSON.stringify(payload)});}
        else{await sb("shipments",{method:"POST",body:JSON.stringify(payload)});}
        await loadAll();setShowShipForm(false);
      }
    }catch(e){alert("Error: "+e.message);}
    setSaving(false);
  };

  const deleteShip=async id=>{
    setSaving(true);
    try{
      if(isJuniorAccountant){
        const oldData=ships.find(s=>s.id===id);
        await sb("pending_changes",{method:"POST",body:JSON.stringify({action:"delete",table_name:"shipments",record_id:id,new_data:null,old_data:oldData||null,submitted_by:userInfo.id,submitted_by_name:userInfo.name,status:"pending"})});
        await loadAll();setDeleteId(null);
        alert("Delete request submitted for approval by senior accountant or admin.");
      } else {
        await sb(`shipments?id=eq.${id}`,{method:"DELETE"});
        await loadAll();setDeleteId(null);
      }
    }catch(e){alert("Error: "+e.message);}
    setSaving(false);
  };

  const openAddProfit=()=>{setProfitForm({...EMPTY_PROFIT});setEditProfitId(null);setShowProfit(true);};
  const openEditProfit=p=>{setProfitForm({...p});setEditProfitId(p.id);setShowProfit(true);};
  const setPF=(k,v)=>setProfitForm(f=>({...f,[k]:v}));

  const selectProfitInv=inv=>{
    const s=ships.find(x=>x.invoice_no===inv);
    if(!s){setPF("invoice_no",inv);return;}
    const c=calcShip(s);
    const _allBRCs=[...bcs.flatMap(b=>b.brc_entries||[]),...standaloneBRCs];
    const _allIRMs=[...bcs.flatMap(b=>b.irm_entries||[]),...standaloneIRMs];
    const {paidINR}=calcEffectivePaid(inv,_allBRCs,_allIRMs);
    setProfitForm(f=>({...f,invoice_no:inv,invoice_date:s.invoice_date,buyer_name:s.buyer_name,port_of_discharge:s.port_of_discharge,invoice_amt_inr:c.invoiceAmtINR,payment_received_inr:Math.round(paidINR)}));
  };

  const saveProfit=async()=>{
    if(!profitForm.invoice_no){alert("Invoice No required.");return;}
    setSaving(true);
    try{
      const payload={...profitForm};delete payload.id;delete payload.created_at;delete payload.qty_mt;
      const numFields=["invoice_amt_inr","payment_received_inr","rice_purchase_val","pp_bags_purchase_val","local_transport","ocean_freight","cha_clearing","shipping_line_charges","inspect_agency","coc_ectn","other_exp"];
      numFields.forEach(f=>{if(payload[f]===""||payload[f]===undefined)payload[f]=null;else payload[f]=Number(payload[f])||null;});
      if(editProfitId){await sb(`profitability?id=eq.${editProfitId}`,{method:"PATCH",body:JSON.stringify(payload)});}
      else{await sb("profitability",{method:"POST",body:JSON.stringify(payload)});}
      await loadAll();setShowProfit(false);
    }catch(e){alert("Error: "+e.message);}
    setSaving(false);
  };

  const deleteProfit=async id=>{if(!window.confirm("Delete?"))return;setSaving(true);try{await sb(`profitability?id=eq.${id}`,{method:"DELETE"});await loadAll();}catch(e){alert("Error: "+e.message);}setSaving(false);};

  const saveBC=async(bc)=>{
    setSaving(true);
    try{
      const{irm_entries,brc_entries,...bcData}=bc;
      let bcId=bc.id;
      const isExisting=bcs.find(b=>b.id===bc.id);
      if(isExisting){
        await sb(`bill_collections?id=eq.${bc.id}`,{method:"PATCH",body:JSON.stringify({bank_name:bcData.bank_name,bc_no:bcData.bc_no,bc_date:bcData.bc_date,bc_amount_usd:n(bcData.bc_amount_usd)||null,linked_invoices:bcData.linked_invoices||[],linked_brcs:bcData.linked_brcs||[],total_inv_usd:n(bcData.total_inv_usd)||null,total_brc_usd:n(bcData.total_brc_usd)||null})});
        await sb(`irm_entries?bc_id=eq.${bc.id}`,{method:"DELETE"});
        await sb(`brc_entries?bc_id=eq.${bc.id}`,{method:"DELETE"});
      }else{
        const res=await sb("bill_collections",{method:"POST",body:JSON.stringify({bank_name:bcData.bank_name,bc_no:bcData.bc_no,bc_date:bcData.bc_date,bc_amount_usd:n(bcData.bc_amount_usd)||null,linked_invoices:bcData.linked_invoices||[],linked_brcs:bcData.linked_brcs||[],total_inv_usd:n(bcData.total_inv_usd)||null,total_brc_usd:n(bcData.total_brc_usd)||null})});
        bcId=res[0]?.id;
      }
      // IRM and BRC entries are saved via their own modals
      await loadAll();setShowBC(false);setEditBC(null);
    }catch(e){alert("Error saving BC: "+e.message);}
    setSaving(false);
  };

  const profitCalc=useMemo(()=>{try{return calcProfit(profitForm,ships);}catch{return{interest:0,bankCh:0,localBrokerage:0,totalFOB:0,totalDirect:0,totalCIF:0,profit:0};}},[profitForm,ships]);
  const shipCalc=useMemo(()=>calcShip(shipForm),[shipForm]);
  const selectedBC=bcs.find(b=>b.id===shipForm.bc_id)||null;
  const viewShip=ships.find(s=>s.id===viewShipId)||null;

  const shareShip=s=>{const c=calcShip(s),bc=getBC(s),bal=c.invoiceAmtUSD-(bc?bc.total_amt_usd:0);setShareText(`${COMPANY.name}\nShipment: ${s.invoice_no}\nDate: ${s.invoice_date}\nBuyer: ${s.buyer_name} (${s.buyer_country})\nProduct: ${s.product}\nQty: ${s.qty} MT @ $${s.rate_per_mt}/MT | ${s.delivery_terms}\nInvoice: ${fU(c.invoiceAmtUSD)}\nPayment: ${bc?fU(bc.total_amt_usd):"Pending"}\nBalance: ${fU(bal)}\nRODTEP: ${s.rodtep_status} | GST: ${s.gst_status}\n${COMPANY.address}`);};
  const shareAll=()=>setShareText(`${COMPANY.name}\nFY ${fy} Summary\nShipments: ${totals.count}\nInvoice: ${fU(totals.invUSD)}\nPayment: ${fU(totals.paidUSD)}\nBalance: ${fU(totals.bal)}\nBRC Pending: ${totals.brcPend}\n${COMPANY.address}`);

  const doImport=rows=>{
    const ex=new Set(ships.map(s=>s.invoice_no));
    const nr=rows.filter(r=>!ex.has(r.invoice_no));
    Promise.all(nr.map(r=>sb("shipments",{method:"POST",body:JSON.stringify(r)}))).then(()=>{loadAll();setShowImport(false);alert(`Imported ${nr.length} shipment(s). ${rows.length-nr.length} duplicate(s) skipped.`);}).catch(e=>alert("Error: "+e.message));
  };

  const doSort=col=>{if(sortCol===col)setSortDir(d=>d==="asc"?"desc":"asc");else{setSortCol(col);setSortDir("asc");}};
  function Th({col,label,right,filterable}){
    const hasFilter=colFilters[col]&&colFilters[col].length>0;
    return(
      <th style={{padding:"2px 4px",textAlign:right?"right":"left",color:"#64748b",fontWeight:600,
                  fontSize:11.5,borderBottom:"2px solid #e2e8f0",whiteSpace:"nowrap",
                  userSelect:"none",background:hasFilter?"#eff6ff":"#f8fafc",
                  position:"relative",minWidth:80}}>
        <div style={{display:"flex",alignItems:"center",gap:2,cursor:"pointer"}}
             onClick={()=>doSort(col)}>
          <span style={{overflow:"hidden",textOverflow:"ellipsis",padding:"7px 4px"}}>{label}</span>
          <span style={{fontSize:10}}>{sortCol===col?(sortDir==="asc"?"↑":"↓"):""}</span>
          {filterable&&<span onClick={e=>{e.stopPropagation();setActiveFilterCol(c=>c===col?null:col);}}
            style={{marginLeft:2,padding:"1px 4px",borderRadius:3,fontSize:10,cursor:"pointer",
                    background:hasFilter?"#1d4ed8":"#e2e8f0",color:hasFilter?"#fff":"#64748b"}}>
            ▼
          </span>}
        </div>
        {filterable&&activeFilterCol===col&&(
          <div style={{position:"absolute",top:"100%",left:0,zIndex:50,background:"#fff",
                       border:"1px solid #e2e8f0",borderRadius:6,boxShadow:"0 4px 12px rgba(0,0,0,0.15)",
                       padding:6,minWidth:140}} onClick={e=>e.stopPropagation()}>
            <input autoFocus value={colFilters[col]||""} placeholder={"Filter "+label+"..."}
                   onChange={e=>setColFilters(f=>({...f,[col]:e.target.value}))}
                   style={{...iS,fontSize:11,padding:"4px 6px",marginBottom:4}}/>
            <div style={{display:"flex",gap:4,justifyContent:"flex-end"}}>
              <button onClick={()=>{setColFilters(f=>{const n={...f};delete n[col];return n;});setActiveFilterCol(null);}}
                style={{fontSize:10,padding:"2px 6px",background:"#fee2e2",color:"#dc2626",border:"none",borderRadius:4,cursor:"pointer"}}>
                Clear
              </button>
              <button onClick={()=>setActiveFilterCol(null)}
                style={{fontSize:10,padding:"2px 6px",background:"#eff6ff",color:"#1d4ed8",border:"none",borderRadius:4,cursor:"pointer"}}>
                Done
              </button>
            </div>
          </div>
        )}
      </th>
    );
  }

  const SHIP_SECTIONS=[
    {title:"Invoice & Buyer",fields:[["invoice_no","Invoice No *","text"],["invoice_date","Invoice Date","date"],["buyer_name","Buyer Name *","text"],["buyer_country","Buyer Country","select",COUNTRIES]]},
    {title:"Shipping",fields:[["port_of_loading","Port of Loading","text"],["port_of_discharge","Port of Discharge","text"],["shipping_bill_no","Shipping Bill No","text"],["shipping_bill_date","SB Date","date"],["port_code","Port Code","text"],["bl_no","BL No","text"],["bl_date","BL Date","date"]]},
    {title:"Commercial",fields:[["product","Product","text"],["delivery_terms","Delivery Terms","select",DEL_TERMS],["qty","Qty (MT)","number"],["rate_per_mt","Rate/MT (USD)","number"],["exchange_rate","Exchange Rate","number"],["igst","IGST (INR)","number"],["fob_value_usd","FOB Value (USD)","number"],["rodtep_amount","RODTEP Amt (INR)","number"],["rodtep_status","RODTEP Status","select",RODTEP_ST],["gst_status","GST Status","select",GST_ST]]},
  ];

  // Export data for the current tab/modal
  const exportData = useMemo(()=>{
    if(exportModal==="shipments") return fyShips;
    if(exportModal==="profitability") return fyProfits;
    if(exportModal==="bc") return bcs;
    if(exportModal==="dashboard") return fyShips;
    return [];
  },[exportModal,fyShips,fyProfits,bcs]);

  if(!session)return(
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#1e3a5f 0%,#16a34a 100%)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"system-ui,sans-serif",padding:16}}>
      <div style={{background:"#fff",borderRadius:16,padding:32,width:"100%",maxWidth:380,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{textAlign:"center",marginBottom:24}}>
          <Logo size={64}/>
          <h2 style={{margin:"10px 0 2px",color:"#1e3a5f",fontSize:18,fontWeight:800}}>{COMPANY.name}</h2>
          <p style={{color:"#64748b",fontSize:11,margin:"0 0 4px",fontStyle:"italic"}}>{COMPANY.tagline}</p>
          <p style={{color:"#94a3b8",fontSize:10,margin:"0 0 16px"}}>{COMPANY.address}</p>
        </div>
        <div style={{marginBottom:14}}><label style={{fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:4}}>Email</label><input type="email" value={loginForm.email} onChange={e=>setLoginForm(f=>({...f,email:e.target.value}))} style={iS} placeholder="your@email.com" onKeyDown={e=>e.key==="Enter"&&doLogin()}/></div>
        <div style={{marginBottom:16}}><label style={{fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:4}}>Password</label><input type="password" value={loginForm.password} onChange={e=>setLoginForm(f=>({...f,password:e.target.value}))} style={iS} onKeyDown={e=>e.key==="Enter"&&doLogin()}/></div>
        {loginForm.error&&<p style={{color:"#dc2626",fontSize:12,marginBottom:10}}>{loginForm.error}</p>}
        <button onClick={doLogin} disabled={loginForm.loading} style={{width:"100%",background:"linear-gradient(135deg,#1e3a5f,#16a34a)",color:"#fff",border:"none",borderRadius:8,padding:"12px 0",fontWeight:700,fontSize:15,cursor:"pointer"}}>{loginForm.loading?"Signing in...":"Sign In"}</button>
        <p style={{textAlign:"center",fontSize:11,color:"#64748b",marginTop:12}}>Secure login · Data stored in cloud</p>
      </div>
    </div>
  );

  return(
    <div style={{minHeight:"100vh",background:"#f1f5f9",fontFamily:"system-ui,sans-serif"}}>
      <div style={{background:"linear-gradient(135deg,#1e3a5f 0%,#1e5799 100%)",color:"#fff",boxShadow:"0 2px 12px rgba(0,0,0,0.2)"}}>
        <div style={{padding:"8px 12px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}><Logo size={30}/><div><div style={{fontWeight:800,fontSize:11,lineHeight:1.2}}>{COMPANY.name}</div><div style={{fontSize:9,opacity:0.7}}>{COMPANY.tagline}</div></div></div>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontSize:10,opacity:0.9}}>{userInfo?.name?.split(" ")[0]}</span>
            <span style={{background:"rgba(255,255,255,0.2)",borderRadius:4,padding:"1px 6px",fontSize:9}}>{userInfo?.role}</span>
            <button onClick={doLogout} style={{background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:10}}>Logout</button>
          </div>
        </div>
        <div style={{padding:"0 12px 8px",display:"flex",gap:6,flexWrap:"wrap"}}>
          {canEdit&&<button onClick={()=>setShowImport(true)} style={{background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontSize:11,fontWeight:600}}>📥 Import</button>}
          <button onClick={shareAll} style={{background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontSize:11,fontWeight:600}}>📱 Share</button>
          {isAdmin&&<button onClick={()=>setShowUsers(true)} style={{background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontSize:11,fontWeight:600}}>👥 Users</button>}
          {(isAdmin||isSeniorAccountant)&&<ApprovalBtn pendings={pendings} onClick={()=>setShowApprovals(true)}/>}
          {isJuniorAccountant&&<MyRequestsBtn pendings={pendings} userId={userInfo?.id} onClick={()=>setShowApprovals(true)}/>}
          <button onClick={()=>setShowChangePwd(true)} style={{background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontSize:11,fontWeight:600}}>🔑 Password</button>
          <button onClick={loadAll} style={{background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontSize:11,fontWeight:600}}>🔄 Refresh</button>
        </div>
      </div>

      {showUpdateBanner&&(
        <div style={{background:"linear-gradient(135deg,#1e3a5f,#0369a1)",padding:"10px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:18}}>🚀</span>
            <div>
              <div style={{color:"#fff",fontWeight:700,fontSize:13}}>New version available</div>
              <div style={{color:"#93c5fd",fontSize:11}}>The app has been updated. Reload to get the latest version and log in again.</div>
            </div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>{localStorage.removeItem("sb_session");localStorage.removeItem("sb_user");sessionStorage.clear();window.location.reload();}} style={{background:"#fff",color:"#1e3a5f",border:"none",borderRadius:7,padding:"7px 16px",cursor:"pointer",fontWeight:700,fontSize:12}}>
              🔄 Reload & Login
            </button>
            <button onClick={()=>setShowUpdateBanner(false)} style={{background:"rgba(255,255,255,0.15)",color:"#fff",border:"none",borderRadius:7,padding:"7px 12px",cursor:"pointer",fontSize:12}}>
              Later
            </button>
          </div>
        </div>
      )}
      <div style={{background:"#fff",borderBottom:"1px solid #e2e8f0",display:"flex",overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
        {[["dashboard","📊 Dashboard"],["shipments","📦 Register"],
          ...(!isJuniorAccountant?[["profitability","💰 P&L"],["bcmanager","🏦 Bill Coll."],["banking","🏛 Banking Forms"]]:[]),
          ["buyers","👥 Buyers"],
          ...(!isJuniorAccountant||true?[["contracts","📋 Contracts"]]:[]),
        ].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)} style={{background:"none",border:"none",borderBottom:tab===k?"3px solid #1e3a5f":"3px solid transparent",color:tab===k?"#1e3a5f":"#64748b",padding:"11px 14px",cursor:"pointer",fontWeight:tab===k?700:500,fontSize:12,whiteSpace:"nowrap",flex:"1 0 auto"}}>{l}</button>
        ))}
      </div>

      {loading&&<div style={{background:"#eff6ff",padding:"6px 12px",fontSize:12,color:"#1d4ed8",textAlign:"center"}}>Loading data...</div>}

      <div style={{padding:"12px",maxWidth:1400,margin:"0 auto"}}>

        {tab==="dashboard"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:10,marginBottom:14}}>
              <div><h2 style={{margin:"0 0 2px",color:"#1e3a5f",fontSize:17}}>Dashboard</h2><p style={{margin:0,fontSize:11,color:"#64748b"}}>FY {fy} · Live cloud data</p></div>
              <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                <FYBar selected={fy} onChange={setFy} counts={fyCounts}/>
                <button onClick={()=>setExportModal("dashboard")} style={{background:"#1e3a5f",color:"#fff",border:"none",borderRadius:7,padding:"6px 12px",cursor:"pointer",fontWeight:600,fontSize:11}}>📄 Export</button>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10,marginBottom:18}}>
              {[{l:"Shipments",v:totals.count,i:"📦",c:"#1e3a5f",click:()=>{setTab("shipments");setDashFilter(null);}},
                {l:"Invoice (USD)",v:fU(totals.invUSD),i:"🧾",c:"#0369a1",click:null},
                {l:"Invoice (INR)",v:fR(totals.invINR),i:"₹",c:"#7c3aed",click:null},
                {l:"FOB (USD)",v:fU(totals.fobUSD),i:"🚢",c:"#0891b2",click:null},
                {l:"Pmt Rcvd (USD)",v:fU(totals.paidUSD),i:"✅",c:"#16a34a",click:null},
                {l:"Pmt Rcvd (INR)",v:fR(totals.paidINR),i:"✅",c:"#15803d",click:null},
                {l:"Balance (USD)",v:fU(totals.bal),i:"⏳",c:totals.bal>0?"#dc2626":"#16a34a",click:null},
                {l:"BRC Pending",v:totals.brcPend,i:"🔴",c:"#d97706",click:()=>{setTab("shipments");setDashFilter("brc");}},
                {l:"RODTEP Pending",v:totals.rodPend,i:"📋",c:"#d97706",click:()=>{setTab("shipments");setDashFilter("rodtep");}},
                {l:"GST Pending",v:totals.gstPend,i:"📋",c:"#d97706",click:()=>{setTab("shipments");setDashFilter("gst");}}
              ].map((x,i)=>(
                <div key={i} onClick={x.click||undefined} style={{background:"#fff",borderRadius:10,padding:"12px",boxShadow:"0 1px 4px rgba(0,0,0,0.07)",borderLeft:`4px solid ${x.c}`,cursor:x.click?"pointer":"default",transition:"box-shadow 0.15s"}}>
                  <div style={{fontSize:16}}>{x.i}</div><div style={{fontSize:13,fontWeight:700,color:x.c,margin:"3px 0 2px",wordBreak:"break-all"}}>{x.v}</div>
                  <div style={{fontSize:10,color:"#64748b"}}>{x.l}{x.click&&<span style={{marginLeft:4,fontSize:9,color:"#0369a1"}}>↗ view</span>}</div>
                </div>
              ))}
            </div>
            <h3 style={{color:"#1e3a5f",marginBottom:8,fontSize:13}}>Year-wise Summary</h3>
            <div style={{background:"#fff",borderRadius:12,overflow:"auto",boxShadow:"0 1px 4px rgba(0,0,0,0.07)",marginBottom:18}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead><tr style={{background:"#f8fafc"}}>{["FY","Ships","Invoice(USD)","Pmt(USD)","Balance(USD)"].map(h=><th key={h} style={{padding:"8px 10px",textAlign:h==="FY"||h==="Ships"?"left":"right",color:"#64748b",fontWeight:600,fontSize:11,borderBottom:"1px solid #e2e8f0"}}>{h}</th>)}</tr></thead>
                <tbody>{allYears.map(row=>(
                  <tr key={row.fy} onClick={()=>setFy(row.fy)} style={{borderBottom:"1px solid #f1f5f9",cursor:"pointer",background:fy===row.fy?"#eff6ff":"transparent"}}>
                    <td style={{padding:"8px 10px",fontWeight:700,color:fy===row.fy?"#1e3a5f":"#374151",fontSize:11}}>{fy===row.fy&&"▶ "}FY {row.fy}{row.fy===CURR_FY&&<span style={{marginLeft:4,fontSize:9,background:"#dcfce7",color:"#16a34a",borderRadius:10,padding:"1px 5px"}}>Current</span>}</td>
                    <td style={{padding:"8px 10px",fontSize:11}}>{row.count||"—"}</td>
                    <td style={{padding:"8px 10px",textAlign:"right",fontWeight:600,fontSize:11}}>{row.count>0?fU(row.inv):"—"}</td>
                    <td style={{padding:"8px 10px",textAlign:"right",color:"#16a34a",fontSize:11}}>{row.count>0?fU(row.paid):"—"}</td>
                    <td style={{padding:"8px 10px",textAlign:"right",color:row.bal>0?"#dc2626":"#16a34a",fontSize:11}}>{row.count>0?fU(row.bal):"—"}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <h3 style={{color:"#1e3a5f",marginBottom:8,fontSize:13}}>Recent Shipments — FY {fy}</h3>
            {fyShips.length===0?<div style={{background:"#fff",borderRadius:12,padding:20,textAlign:"center",color:"#94a3b8",fontSize:13}}>No shipments for FY {fy}.</div>:
            <div style={{background:"#fff",borderRadius:12,overflow:"auto",boxShadow:"0 1px 4px rgba(0,0,0,0.07)"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:500}}>
                <thead><tr style={{background:"#f8fafc"}}>{["Invoice No","Buyer","Inv.(USD)","Balance",""].map(h=><th key={h} style={{padding:"8px 10px",textAlign:"left",color:"#64748b",fontWeight:600,fontSize:11,borderBottom:"1px solid #e2e8f0"}}>{h}</th>)}</tr></thead>
                <tbody>{fyShips.slice(0,8).map(s=>{const c=calcShip(s),bc=getBC(s),bal=c.invoiceAmtUSD-(bc?bc.total_amt_usd:0);return(
                  <tr key={s.id} style={{borderBottom:"1px solid #f1f5f9"}}>
                    <td style={{padding:"8px 10px",fontWeight:600,color:"#1e3a5f",fontSize:11}}>{s.invoice_no}</td>
                    <td style={{padding:"8px 10px",fontSize:11}}>{s.buyer_name}</td>
                    <td style={{padding:"8px 10px",fontWeight:600,fontSize:11}}>{fU(c.invoiceAmtUSD)}</td>
                    <td style={{padding:"8px 10px",fontWeight:600,color:bal>0?"#dc2626":"#16a34a",fontSize:11}}>{fU(bal)}</td>
                    <td style={{padding:"8px 10px"}}><button onClick={()=>shareShip(s)} style={{background:"#f0fdf4",color:"#16a34a",border:"none",borderRadius:5,padding:"3px 8px",cursor:"pointer",fontSize:11}}>📱</button></td>
                  </tr>
                );})}
                </tbody>
              </table>
            </div>}
          </div>
        )}

        {tab==="shipments"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:10,marginBottom:12}}>
              <div><h2 style={{margin:"0 0 2px",color:"#1e3a5f",fontSize:17}}>Shipment Register</h2><p style={{margin:0,fontSize:11,color:"#64748b"}}>FY {fy} · {fyShips.length} shipment(s)</p></div>
              <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                <FYBar selected={fy} onChange={f=>{setFy(f);setSearch("");}} counts={fyCounts}/>
                <button onClick={()=>setExportModal("shipments")} style={{background:"#0369a1",color:"#fff",border:"none",borderRadius:7,padding:"6px 12px",cursor:"pointer",fontWeight:600,fontSize:11}}>📤 Export</button>
                {canAddShipment&&<button onClick={openAddShip} style={{background:"linear-gradient(135deg,#1e3a5f,#16a34a)",color:"#fff",border:"none",borderRadius:8,padding:"6px 12px",cursor:"pointer",fontWeight:600,fontSize:12}}>+ Add</button>}
              </div>
            </div>
            {isJuniorAccountant&&<JuniorPendingBanner pendings={pendings} userId={userInfo?.id} onViewRejected={()=>setShowApprovals(true)}/>}
            {dashFilter&&<div style={{background:"#fef3c7",border:"1px solid #fbbf24",borderRadius:8,padding:"8px 14px",marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:12}}>
              <span style={{fontWeight:600,color:"#92400e"}}>
                {dashFilter==="brc"?"🔴 Showing: BRC Pending shipments":dashFilter==="rodtep"?"📋 Showing: RODTEP Pending shipments":"📋 Showing: GST Pending shipments"}
                <span style={{marginLeft:6,fontWeight:400}}>({filtered.length} records)</span>
              </span>
              <button onClick={()=>setDashFilter(null)} style={{background:"#dc2626",color:"#fff",border:"none",borderRadius:5,padding:"3px 10px",cursor:"pointer",fontSize:11,fontWeight:600}}>✕ Clear Filter</button>
            </div>}
            <div style={{marginBottom:10,display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search..." style={{...iS,fontSize:13,flex:1,minWidth:160}}/>
              {Object.values(colFilters).some(v=>v)&&(
                <button onClick={()=>setColFilters({})}
                  style={{background:"#fee2e2",color:"#dc2626",border:"none",borderRadius:6,
                          padding:"7px 12px",cursor:"pointer",fontSize:12,fontWeight:600,whiteSpace:"nowrap"}}>
                  ✕ Clear {Object.values(colFilters).filter(v=>v).length} filter{Object.values(colFilters).filter(v=>v).length>1?"s":""}
                </button>
              )}
            </div>
            {fyShips.length===0?<div style={{background:"#fff",borderRadius:12,padding:40,textAlign:"center",color:"#94a3b8"}}><div style={{fontSize:32,marginBottom:8}}>📭</div><div style={{fontSize:14,fontWeight:600}}>No shipments for FY {fy}</div>{canAddShipment&&<button onClick={openAddShip} style={{background:"linear-gradient(135deg,#1e3a5f,#16a34a)",color:"#fff",border:"none",borderRadius:8,padding:"8px 16px",cursor:"pointer",fontWeight:600,marginTop:10,fontSize:13}}>+ Add First Shipment</button>}</div>:
            <>
              <div style={{background:"#fff",borderRadius:12,boxShadow:"0 1px 4px rgba(0,0,0,0.07)",overflow:"auto",maxHeight:"calc(100vh - 240px)",WebkitOverflowScrolling:"touch",position:"relative"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:2200}}>
                  <colgroup>
                    <col style={{width:140}}/>{/* Invoice No - frozen */}
                    <col style={{width:95}}/>{/* Date */}
                    <col style={{width:160}}/>{/* Buyer */}
                    <col style={{width:100}}/>{/* Country */}
                    <col style={{width:140}}/>{/* Product */}
                    <col style={{width:110}}/>{/* Port Load */}
                    <col style={{width:110}}/>{/* Port Disch */}
                    <col style={{width:95}}/>{/* SB No */}
                    <col style={{width:95}}/>{/* SB Date */}
                    <col style={{width:85}}/>{/* Port Code */}
                    <col style={{width:110}}/>{/* BL No */}
                    <col style={{width:95}}/>{/* BL Date */}
                    <col style={{width:75}}/>{/* Qty */}
                    <col style={{width:75}}/>{/* Rate/MT */}
                    <col style={{width:65}}/>{/* Terms */}
                    <col style={{width:105}}/>{/* Inv USD */}
                    <col style={{width:68}}/>{/* ExRate */}
                    <col style={{width:115}}/>{/* Inv INR */}
                    <col style={{width:90}}/>{/* IGST */}
                    <col style={{width:115}}/>{/* Gross INR */}
                    <col style={{width:100}}/>{/* FOB USD */}
                    <col style={{width:110}}/>{/* FOB INR */}
                    <col style={{width:100}}/>{/* RODTEP INR */}
                    <col style={{width:85}}/>{/* RODTEP St */}
                    <col style={{width:75}}/>{/* GST St */}
                    <col style={{width:110}}/>{/* BC No */}
                    <col style={{width:80}}/>{/* BC Bank */}
                    <col style={{width:90}}/>{/* BC Date */}
                    <col style={{width:120}}/>{/* BRC Nos */}
                    <col style={{width:100}}/>{/* BRC Dates */}
                    <col style={{width:100}}/>{/* Pmt USD */}
                    <col style={{width:110}}/>{/* Pmt INR */}
                    <col style={{width:110}}/>{/* Balance */}
                    <col style={{width:130}}/>{/* Actions */}
                  </colgroup>
                  <thead style={{position:"sticky",top:0,zIndex:10}}><tr>
                    <th onClick={()=>doSort("invoice_no")} style={{padding:"9px 10px",textAlign:"left",color:"#64748b",fontWeight:600,fontSize:11.5,borderBottom:"1px solid #e2e8f0",cursor:"pointer",whiteSpace:"nowrap",userSelect:"none",background:"#f0f4ff",position:"sticky",left:0,zIndex:11,minWidth:130,boxShadow:"2px 0 4px rgba(0,0,0,0.08)"}}>Invoice No{sortCol==="invoice_no"?(sortDir==="asc"?" ↑":" ↓"):""}</th><Th col="invoice_date" label="Date" filterable/><Th col="buyer_name" label="Buyer" filterable/><Th col="buyer_country" label="Country" filterable/><Th col="product" label="Product" filterable/><Th col="port_of_loading" label="Port Load" filterable/><Th col="port_of_discharge" label="Port Disch" filterable/><Th col="shipping_bill_no" label="SB No" filterable/><Th col="shipping_bill_date" label="SB Date" filterable/><Th col="port_code" label="Port Code"/><Th col="bl_no" label="BL No"/><Th col="bl_date" label="BL Date"/><Th col="qty" label="Qty(MT)" right/><Th col="rate_per_mt" label="Rate/MT" right/><Th col="delivery_terms" label="Terms" filterable/><Th col="i1" label="Inv(USD)" right/><Th col="exchange_rate" label="ExRate" right/><Th col="i2" label="Inv(INR)" right/><Th col="igst" label="IGST" right/><Th col="i3" label="Gross(INR)" right/><Th col="fob_value_usd" label="FOB(USD)" right/><Th col="i4" label="FOB(INR)" right/><Th col="rodtep_amount" label="RODTEP(INR)" right/><Th col="rodtep_status" label="RODTEP" filterable/><Th col="gst_status" label="GST" filterable/><Th col="bc_no" label="BC No" filterable/><Th col="bc_bank" label="BC Bank" filterable/><Th col="bc_date" label="BC Date" filterable/><Th col="brc_nos" label="BRC No(s)" filterable/><Th col="brc_dates" label="BRC Dates"/><Th col="paid_usd" label="Pmt(USD)" right/><Th col="paid_inr" label="Pmt(INR)" right/><Th col="bal" label="Balance(USD)" right filterable/>
                    {canEdit&&<th style={{padding:"9px 10px",color:"#64748b",fontWeight:600,fontSize:11.5,borderBottom:"1px solid #e2e8f0",background:"#f8fafc",whiteSpace:"nowrap"}}>Actions</th>}
                  </tr></thead>
                  <tbody>
                    {filtered.map(s=>{const c=calcShip(s),bc=getBC(s),bal=c.invoiceAmtUSD-(bc?bc.total_amt_usd:0);
                      const allBRCsReg=[...bcs.flatMap(b=>b.brc_entries||[]),...standaloneBRCs];
                      const allIRMsReg=[...bcs.flatMap(b=>b.irm_entries||[]),...standaloneIRMs];
                      const sBRCs=allBRCsReg.filter(b=>b.linked_invoice_no===s.invoice_no);
                      const brcNos=sBRCs.map(b=>b.brc_no).filter(Boolean).join(", ")||"—";
                      const brcDts=sBRCs.map(b=>b.brc_date).filter(Boolean).join(", ")||"—";
                      const {paidUSD,paidINR}=calcEffectivePaid(s.invoice_no,allBRCsReg,allIRMsReg);
                      return(
                      <tr key={s.id} style={{borderBottom:"1px solid #f1f5f9"}} onDoubleClick={()=>setViewShipId(s.id)}>
                        <td style={{padding:"7px 10px",fontWeight:600,color:"#1e3a5f",whiteSpace:"nowrap",position:"sticky",left:0,background:"#f8fafc",zIndex:5,boxShadow:"2px 0 4px rgba(0,0,0,0.06)",minWidth:130}}>{s.invoice_no}</td>
                        <td style={{padding:"7px 10px",color:"#64748b",whiteSpace:"nowrap"}}>{s.invoice_date}</td>
                        <td style={{padding:"7px 10px",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:160}}>{s.buyer_name}</td>
                        <td style={{padding:"7px 10px",color:"#64748b"}}>{s.buyer_country}</td>
                        <td style={{padding:"7px 10px",whiteSpace:"nowrap",color:"#64748b",overflow:"hidden",textOverflow:"ellipsis",maxWidth:140}}>{s.product}</td>
                        <td style={{padding:"7px 10px",whiteSpace:"nowrap"}}>{s.port_of_loading}</td>
                        <td style={{padding:"7px 10px",whiteSpace:"nowrap"}}>{s.port_of_discharge}</td>
                        <td style={{padding:"7px 10px"}}>{s.shipping_bill_no}</td>
                        <td style={{padding:"7px 10px",color:"#64748b",whiteSpace:"nowrap"}}>{s.shipping_bill_date}</td>
                        <td style={{padding:"7px 10px"}}>{s.port_code}</td>
                        <td style={{padding:"7px 10px"}}>{s.bl_no}</td>
                        <td style={{padding:"7px 10px",color:"#64748b",whiteSpace:"nowrap"}}>{s.bl_date}</td>
                        <td style={{padding:"7px 10px",textAlign:"right"}}>{fi(s.qty)}</td>
                        <td style={{padding:"7px 10px",textAlign:"right"}}>{fi(s.rate_per_mt)}</td>
                        <td style={{padding:"7px 10px"}}><Badge val={s.delivery_terms} map={{CIF:{bg:"#dbeafe",color:"#1d4ed8"},FOB:{bg:"#f3e8ff",color:"#7c3aed"}}}/></td>
                        <td style={{padding:"7px 10px",textAlign:"right",fontWeight:600}}>{fU(c.invoiceAmtUSD)}</td>
                        <td style={{padding:"7px 10px",textAlign:"right"}}>{fi(s.exchange_rate)}</td>
                        <td style={{padding:"7px 10px",textAlign:"right"}}>{fR(c.invoiceAmtINR)}</td>
                        <td style={{padding:"7px 10px",textAlign:"right"}}>{fR(s.igst)}</td>
                        <td style={{padding:"7px 10px",textAlign:"right",fontWeight:600}}>{fR(c.grossTotal)}</td>
                        <td style={{padding:"7px 10px",textAlign:"right"}}>{fU(s.fob_value_usd)}</td>
                        <td style={{padding:"7px 10px",textAlign:"right"}}>{fR(c.fobValueINR)}</td>
                        <td style={{padding:"7px 10px",textAlign:"right"}}>{fR(s.rodtep_amount)}</td>
                        <td style={{padding:"7px 10px"}}><Badge val={s.rodtep_status}/></td>
                        <td style={{padding:"7px 10px"}}><Badge val={s.gst_status}/></td>
                        <td style={{padding:"7px 10px",whiteSpace:"nowrap"}}>{bc?<span style={{fontWeight:600,color:"#1e3a5f"}}>{bc.bc_no}</span>:<span style={{color:"#94a3b8",fontSize:11}}>—</span>}</td>
                        <td style={{padding:"7px 10px",whiteSpace:"nowrap"}}>{bc?<Badge val={bc.bank_name} map={{SBI:{bg:"#dcfce7",color:"#16a34a"},INDUSIND:{bg:"#dbeafe",color:"#1d4ed8"}}}/>:<span style={{color:"#94a3b8",fontSize:11}}>—</span>}</td>
                        <td style={{padding:"7px 10px",color:"#64748b",whiteSpace:"nowrap"}}>{bc?bc.bc_date:"—"}</td>
                        <td style={{padding:"7px 10px",color:"#16a34a",fontWeight:600,whiteSpace:"nowrap"}}>{brcNos}</td>
                        <td style={{padding:"7px 10px",color:"#64748b",whiteSpace:"nowrap"}}>{brcDts}</td>
                        <td style={{padding:"7px 10px",textAlign:"right",color:"#16a34a",fontWeight:600}}>{paidUSD>0?fU(paidUSD):"—"}</td>
                        <td style={{padding:"7px 10px",textAlign:"right",color:"#15803d",fontWeight:600}}>{paidINR>0?fR(paidINR):"—"}</td>
                        <td style={{padding:"7px 10px",textAlign:"right",fontWeight:700,color:(c.invoiceAmtUSD-paidUSD)>0.01?"#dc2626":"#16a34a"}}>{fU(c.invoiceAmtUSD-paidUSD)}</td>
                        {(canAddShipment)&&<td style={{padding:"7px 10px",whiteSpace:"nowrap"}}>
                          {canEditShipment&&<button onClick={()=>openEditShip(s)} style={{background:"#dbeafe",color:"#1d4ed8",border:"none",borderRadius:5,padding:"3px 8px",cursor:"pointer",fontSize:11,marginRight:3}}>Edit</button>}
                          <button onClick={()=>exportShipmentPDF(s,getBC(s))} style={{background:"#eff6ff",color:"#0369a1",border:"none",borderRadius:5,padding:"3px 8px",cursor:"pointer",fontSize:11,marginRight:3}}>📄</button>
                          <button onClick={()=>setShipDocsId(s.id)} style={{background:"#f0fdf4",color:"#16a34a",border:"none",borderRadius:5,padding:"3px 8px",cursor:"pointer",fontSize:11,marginRight:3}}>📁</button>
                          <button onClick={()=>shareShip(s)} style={{background:"#f0fdf4",color:"#16a34a",border:"none",borderRadius:5,padding:"3px 8px",cursor:"pointer",fontSize:11,marginRight:3}}>📱</button>
                          {canDelete&&<button onClick={()=>setDeleteId(s.id)} style={{background:"#fee2e2",color:"#dc2626",border:"none",borderRadius:5,padding:"3px 8px",cursor:"pointer",fontSize:11}}>Del</button>}
                        </td>}
                      </tr>
                    );})}
                  </tbody>
                </table>
              </div>
              <p style={{fontSize:11,color:"#94a3b8",marginTop:6}}>Double-click any row for full details · 📄 = Export single PDF</p>
            </>}
          </div>
        )}

        {tab==="profitability"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:10,marginBottom:14}}>
              <div><h2 style={{margin:"0 0 2px",color:"#1e3a5f",fontSize:17}}>Profitability (P&L)</h2><p style={{margin:0,fontSize:11,color:"#64748b"}}>FY {fy}</p></div>
              <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                <FYBar selected={fy} onChange={setFy} counts={fyCounts}/>
                <button onClick={()=>setExportModal("profitability")} style={{background:"#7c3aed",color:"#fff",border:"none",borderRadius:7,padding:"6px 12px",cursor:"pointer",fontWeight:600,fontSize:11}}>📤 Export</button>
                {canEditPL&&<button onClick={openAddProfit} style={{background:"linear-gradient(135deg,#1e3a5f,#16a34a)",color:"#fff",border:"none",borderRadius:8,padding:"6px 12px",cursor:"pointer",fontWeight:600,fontSize:12}}>+ Add</button>}
              </div>
            </div>
            <ProfitabilityContent fy={fy} fyProfits={fyProfits} ships={ships} canEdit={canEditPL} canDelete={canDelete} openAddProfit={openAddProfit} openEditProfit={openEditProfit} onDelete={deleteProfit}/>
          </div>
        )}

        {tab==="buyers"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:10,marginBottom:14}}>
              <div><h2 style={{margin:"0 0 2px",color:"#1e3a5f",fontSize:17}}>Buyer Master</h2><p style={{margin:0,fontSize:11,color:"#64748b"}}>{buyers.length} buyers</p></div>
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                {canManageContracts&&<button onClick={()=>{setEditBuyer(null);setShowBuyerForm(true);}} style={{background:"linear-gradient(135deg,#1e3a5f,#16a34a)",color:"#fff",border:"none",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontWeight:600,fontSize:12}}>+ Add Buyer</button>}
              </div>
            </div>
            <div style={{marginBottom:10}}><input value={buyerSearch} onChange={e=>setBuyerSearch(e.target.value)} placeholder="Search buyers..." style={{...iS,fontSize:13}}/></div>
            {buyers.length===0
              ?<div style={{background:"#fff",borderRadius:12,padding:40,textAlign:"center",color:"#94a3b8"}}><div style={{fontSize:32,marginBottom:8}}>👥</div><div style={{fontSize:14,fontWeight:600}}>No buyers yet</div>{canManageContracts&&<button onClick={()=>{setEditBuyer(null);setShowBuyerForm(true);}} style={{background:"linear-gradient(135deg,#1e3a5f,#16a34a)",color:"#fff",border:"none",borderRadius:8,padding:"8px 16px",cursor:"pointer",fontWeight:600,marginTop:10}}>+ Add First Buyer</button>}</div>
              :<div style={{display:"grid",gap:10}}>
                {buyers.filter(b=>!buyerSearch||JSON.stringify(b).toLowerCase().includes(buyerSearch.toLowerCase())).map(b=>(
                  <div key={b.id} style={{background:"#fff",borderRadius:12,padding:14,boxShadow:"0 1px 4px rgba(0,0,0,0.07)"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8,marginBottom:8}}>
                      <div>
                        <div style={{fontWeight:700,color:"#1e3a5f",fontSize:14}}>{b.buyer_name}</div>
                        {b.company_name&&<div style={{fontSize:12,color:"#64748b"}}>{b.company_name}</div>}
                        <div style={{fontSize:11,color:"#94a3b8"}}>{b.country}{b.contact_person?" · "+b.contact_person:""}{b.email?" · "+b.email:""}</div>
                      </div>
                      <div style={{display:"flex",gap:6}}>
                        {canManageContracts&&<button onClick={()=>{setEditBuyer(b);setShowBuyerForm(true);}} style={{background:"#dbeafe",color:"#1d4ed8",border:"none",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:600}}>Edit</button>}
                        {canDeleteContracts&&<button onClick={()=>deleteBuyer(b.id)} style={{background:"#fee2e2",color:"#dc2626",border:"none",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:600}}>Delete</button>}
                      </div>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:6,fontSize:11}}>
                      {b.address&&<div><span style={{color:"#94a3b8"}}>Address: </span>{b.address}</div>}
                      {b.payment_terms&&<div><span style={{color:"#94a3b8"}}>Payment: </span><b>{b.payment_terms}</b></div>}
                      {b.bank_name&&<div><span style={{color:"#94a3b8"}}>Bank: </span>{b.bank_name}</div>}
                      {b.swift_code&&<div><span style={{color:"#94a3b8"}}>SWIFT: </span>{b.swift_code}</div>}
                      {b.notes&&<div style={{gridColumn:"1/-1"}}><span style={{color:"#94a3b8"}}>Notes: </span>{b.notes}</div>}
                    </div>
                  </div>
                ))}
              </div>}
          </div>
        )}

        {tab==="banking"&&(
          <BankingFormsTab ships={ships} buyers={buyers} bcs={bcs}/>
        )}
        {tab==="bcmanager"&&(
          <div>
            {/* ── Sub-tab bar ── */}
            <div style={{display:"flex",gap:0,marginBottom:16,background:"#f1f5f9",borderRadius:10,padding:4}}>
              {[
                {key:"irm", label:"📥 IRM",  count:bcs.flatMap(b=>b.irm_entries||[]).length + standaloneIRMs.length},
                {key:"brc", label:"✅ BRC",  count:bcs.flatMap(b=>b.brc_entries||[]).length + standaloneBRCs.length},
                {key:"bc",  label:"🏦 Bill Collection", count:bcs.length},
              ].map(({key,label,count})=>(
                <button key={key} onClick={()=>setBcSubTab(key)}
                  style={{flex:1,padding:"8px 4px",border:"none",borderRadius:7,cursor:"pointer",
                          fontWeight:700,fontSize:12,transition:"all 0.15s",
                          background:bcSubTab===key?"#fff":"transparent",
                          color:bcSubTab===key?"#1e3a5f":"#64748b",
                          boxShadow:bcSubTab===key?"0 1px 4px rgba(0,0,0,0.10)":"none"}}>
                  {label}
                  <span style={{marginLeft:6,background:bcSubTab===key?"#1e3a5f":"#e2e8f0",
                                color:bcSubTab===key?"#fff":"#64748b",
                                borderRadius:10,padding:"1px 7px",fontSize:10}}>
                    {count}
                  </span>
                </button>
              ))}
            </div>

            {/* ════════════ IRM SUB-TAB ════════════ */}
            {bcSubTab==="irm"&&(()=>{
              const allIRMs = [...bcs.flatMap(b=>b.irm_entries||[]), ...standaloneIRMs];
              const totIRM  = allIRMs.reduce((s,i)=>s+n(i.irm_total_usd||i.irm_amt_usd),0);
              const totINR  = allIRMs.reduce((s,i)=>s+n(i.irm_amt_inr),0);
              return(
                <div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                    <div>
                      <h2 style={{margin:"0 0 2px",color:"#1e3a5f",fontSize:16}}>IRM Entries</h2>
                      <p style={{margin:0,fontSize:11,color:"#64748b"}}>{allIRMs.length} entries · USD {fU(totIRM)} · {fR(totINR)}</p>
                    </div>
                    {canEditBC&&<button onClick={()=>setIrmModal({irm:null,bcId:null})}
                      style={{background:"linear-gradient(135deg,#0369a1,#0284c7)",color:"#fff",border:"none",
                              borderRadius:8,padding:"7px 14px",cursor:"pointer",fontWeight:700,fontSize:12}}>
                      + New IRM
                    </button>}
                  </div>
                  {allIRMs.length===0&&<div style={{background:"#fff",borderRadius:12,padding:30,textAlign:"center",color:"#94a3b8",fontSize:13}}>No IRM entries yet. Create your first IRM.</div>}
                  <div style={{display:"grid",gap:8}}>
                    {allIRMs.map(irm=>{
                      const parentBC=bcs.find(b=>(b.irm_entries||[]).some(i=>i.id===irm.id));
                      const utilised=[...bcs.flatMap(b=>b.brc_entries||[]),...standaloneBRCs]
                        .flatMap(b=>b.irm_allocations||[])
                        .filter(a=>String(a.irmId)===String(irm.id))
                        .reduce((s,a)=>s+n(a.irmUtilAmt),0);
                      const balance=n(irm.irm_total_usd||irm.irm_amt_usd)-utilised;
                      return(
                        <div key={irm.id} style={{background:"#fff",borderRadius:10,padding:14,
                                                   boxShadow:"0 1px 4px rgba(0,0,0,0.06)",
                                                   borderLeft:`4px solid ${balance<0.01?"#86efac":"#93c5fd"}`}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
                            <div>
                              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
                                <span style={{fontWeight:700,color:"#1e3a5f",fontSize:14}}>{irm.irm_no}</span>
                                <span style={{fontSize:10,background:"#dbeafe",color:"#1d4ed8",borderRadius:10,padding:"1px 8px"}}>{irm.irm_date}</span>
                                {parentBC&&<span style={{fontSize:10,background:"#f0fdf4",color:"#16a34a",borderRadius:10,padding:"1px 8px"}}>BC: {parentBC.bc_no}</span>}
                              </div>
                              <div style={{display:"flex",gap:16,fontSize:12,flexWrap:"wrap"}}>
                                <span>Total: <strong style={{color:"#1e3a5f"}}>{fU(n(irm.irm_total_usd||irm.irm_amt_usd))}</strong></span>
                                <span>Utilised: <strong style={{color:"#dc2626"}}>{fU(utilised)}</strong></span>
                                <span>Balance: <strong style={{color:balance<0.01?"#16a34a":"#0369a1"}}>{fU(balance)}</strong></span>
                                <span style={{color:"#64748b"}}>INR: {fR(irm.irm_amt_inr)}</span>
                                {n(irm.intermediary_charges_usd)>0&&<span style={{color:"#64748b"}}>Charges: {fU(n(irm.intermediary_charges_usd))}</span>}
                              </div>
                            </div>
                            <div style={{display:"flex",gap:6}}>
                              <button onClick={()=>setIrmDocsModal({irm})}
                                style={{background:"#f0fdf4",color:"#16a34a",border:"none",borderRadius:6,
                                        padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:600}}>📁 Docs</button>
                              {canEditBC&&<button onClick={()=>setIrmModal({irm,bcId:parentBC?.id})}
                                style={{background:"#dbeafe",color:"#1d4ed8",border:"none",borderRadius:6,
                                        padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:600}}>Edit</button>}
                              {canDelete&&<button onClick={async()=>{
                                if(!window.confirm("Delete IRM "+irm.irm_no+"?"))return;
                                try{await sb(`irm_entries?id=eq.${irm.id}`,{method:"DELETE"});await loadAll();}
                                catch(e){alert("Error: "+e.message);}
                              }} style={{background:"#fee2e2",color:"#dc2626",border:"none",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:600}}>Delete</button>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* ════════════ BRC SUB-TAB ════════════ */}
            {bcSubTab==="brc"&&(()=>{
              const allBRCs = [...bcs.flatMap(b=>b.brc_entries||[]), ...standaloneBRCs];
              const totBRC  = allBRCs.reduce((s,b)=>s+n(b.brc_amt_usd),0);
              return(
                <div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                    <div>
                      <h2 style={{margin:"0 0 2px",color:"#1e3a5f",fontSize:16}}>BRC Entries</h2>
                      <p style={{margin:0,fontSize:11,color:"#64748b"}}>{allBRCs.length} entries · Total: USD {fU(totBRC)}</p>
                    </div>
                    {canEditBC&&<button onClick={()=>setBrcModal({brc:null,bcId:null})}
                      style={{background:"linear-gradient(135deg,#15803d,#16a34a)",color:"#fff",border:"none",
                              borderRadius:8,padding:"7px 14px",cursor:"pointer",fontWeight:700,fontSize:12}}>
                      + New BRC
                    </button>}
                  </div>
                  {allBRCs.length===0&&<div style={{background:"#fff",borderRadius:12,padding:30,textAlign:"center",color:"#94a3b8",fontSize:13}}>No BRC entries yet. Create IRM first, then BRC.</div>}
                  <div style={{display:"grid",gap:8}}>
                    {allBRCs.map(brc=>{
                      const parentBC=bcs.find(b=>(b.brc_entries||[]).some(x=>x.id===brc.id));
                      const allIRMsForBRC=[...bcs.flatMap(b=>b.irm_entries||[]),...standaloneIRMs];
                      return(
                        <div key={brc.id} style={{background:"#fff",borderRadius:10,padding:14,
                                                   boxShadow:"0 1px 4px rgba(0,0,0,0.06)",
                                                   borderLeft:"4px solid #86efac"}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
                            <div>
                              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
                                <span style={{fontWeight:700,color:"#1e3a5f",fontSize:14}}>{brc.brc_no||"—"}</span>
                                <span style={{fontSize:10,background:"#dcfce7",color:"#16a34a",borderRadius:10,padding:"1px 8px"}}>{brc.brc_date||"—"}</span>
                                {parentBC&&<span style={{fontSize:10,background:"#f0fdf4",color:"#15803d",borderRadius:10,padding:"1px 8px"}}>BC: {parentBC.bc_no}</span>}
                                {brc.linked_invoice_no&&<span style={{fontSize:10,background:"#fef9c3",color:"#92400e",borderRadius:10,padding:"1px 8px"}}>Inv: {brc.linked_invoice_no}</span>}
                              </div>
                              <div style={{display:"flex",gap:16,fontSize:12,flexWrap:"wrap"}}>
                                <span>Amount: <strong style={{color:"#1e3a5f"}}>{fU(n(brc.brc_amt_usd))}</strong></span>
                                {(brc.irm_allocations||[]).map((a,i)=>{
                                  const irm=allIRMsForBRC.find(x=>String(x.id)===String(a.irmId));
                                  return<span key={i} style={{color:"#0369a1"}}>IRM: {irm?.irm_no||a.irmId} → {fU(n(a.irmUtilAmt))}</span>;
                                })}
                              </div>
                            </div>
                            <div style={{display:"flex",gap:6}}>
                              <button onClick={()=>setBrcDocsModal({brc})}
                                style={{background:"#f0fdf4",color:"#16a34a",border:"none",borderRadius:6,
                                        padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:600}}>📁 Docs</button>
                              {canEditBC&&<button onClick={()=>setBrcModal({brc,bcId:parentBC?.id})}
                                style={{background:"#dbeafe",color:"#1d4ed8",border:"none",borderRadius:6,
                                        padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:600}}>Edit</button>}
                              {canDelete&&<button onClick={async()=>{
                                if(!window.confirm("Delete BRC "+brc.brc_no+"?"))return;
                                try{await sb(`brc_entries?id=eq.${brc.id}`,{method:"DELETE"});await loadAll();}
                                catch(e){alert("Error: "+e.message);}
                              }} style={{background:"#fee2e2",color:"#dc2626",border:"none",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:600}}>Delete</button>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* ════════════ BC SUB-TAB ════════════ */}
            {bcSubTab==="bc"&&(
              <div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <div>
                    <h2 style={{margin:"0 0 2px",color:"#1e3a5f",fontSize:16}}>Bill Collections</h2>
                    <p style={{margin:0,fontSize:11,color:"#64748b"}}>{bcs.length} records</p>
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={()=>setExportModal("bc")} style={{background:"#15803d",color:"#fff",border:"none",borderRadius:7,padding:"6px 12px",cursor:"pointer",fontWeight:600,fontSize:11}}>📤 Export</button>
                    {canEditBC&&<button onClick={()=>{setEditBC(null);setShowBC(true);}}
                      style={{background:"linear-gradient(135deg,#1e3a5f,#16a34a)",color:"#fff",border:"none",
                              borderRadius:8,padding:"7px 14px",cursor:"pointer",fontWeight:700,fontSize:12}}>
                      + New BC
                    </button>}

                  </div>
                </div>
                {bcs.length===0&&<div style={{background:"#fff",borderRadius:12,padding:30,textAlign:"center",color:"#94a3b8",fontSize:13}}>No bill collections yet. Create IRM and BRC entries first.</div>}
                <div style={{display:"grid",gap:10}}>
                  {bcs.map(bc=>(
                    <div key={bc.id} style={{background:"#fff",borderRadius:12,padding:14,boxShadow:"0 1px 4px rgba(0,0,0,0.07)"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8,marginBottom:10}}>
                        <div>
                          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}>
                            <span style={{fontWeight:700,color:"#1e3a5f",fontSize:14}}>{bc.bc_no}</span>
                            <Badge val={bc.bank_name} map={{SBI:{bg:"#dcfce7",color:"#16a34a"},INDUSIND:{bg:"#dbeafe",color:"#1d4ed8"}}}/>
                          </div>
                          <div style={{fontSize:11,color:"#64748b"}}>Date: {bc.bc_date}{bc.bc_amount_usd?" · Amount: "+fU(bc.bc_amount_usd):""}</div>
                          {(bc.linked_invoices||[]).length>0&&<div style={{fontSize:11,color:"#0369a1",marginTop:2}}>Invoices: {bc.linked_invoices.join(", ")}</div>}
                          {(bc.linked_brcs||[]).length>0&&<div style={{fontSize:11,color:"#15803d",marginTop:1}}>BRCs: {bc.linked_brcs.join(", ")}</div>}
                        </div>
                        <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                          <button onClick={()=>exportBCPDF(bc)} style={{background:"#eff6ff",color:"#0369a1",border:"none",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:600}}>📄 PDF</button>
                          <button onClick={()=>setBCDocsId(bc.id)} style={{background:"#f0fdf4",color:"#16a34a",border:"none",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:600}}>📁 Docs</button>
                          {canEdit&&<button onClick={()=>{setEditBC(bc);setShowBC(true);}} style={{background:"#dbeafe",color:"#1d4ed8",border:"none",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:600}}>Edit</button>}
                          {canDelete&&<button onClick={async()=>{
                            if(!window.confirm(`Delete BC ${bc.bc_no}?`))return;
                            try{
                              await sb(`brc_entries?bc_id=eq.${bc.id}`,{method:"DELETE"});
                              await sb(`irm_entries?bc_id=eq.${bc.id}`,{method:"DELETE"});
                              await sb(`bill_collections?id=eq.${bc.id}`,{method:"DELETE"});
                              await loadAll();
                            }catch(e){alert("Error: "+e.message);}
                          }} style={{background:"#fee2e2",color:"#dc2626",border:"none",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:600}}>Delete</button>}
                        </div>
                      </div>
                      {/* IRM + BRC summary inside BC card — derive from linked_brcs */}
                      {(()=>{
                        const allBRCsAll=[...bcs.flatMap(b=>b.brc_entries||[]),...standaloneBRCs];
                        const allIRMsAll=[...bcs.flatMap(b=>b.irm_entries||[]),...standaloneIRMs];
                        // BRCs linked to this BC
                        const bcBRCs=allBRCsAll.filter(b=>(bc.linked_brcs||[]).includes(b.brc_no));
                        // IRMs linked via those BRCs
                        const bcIRMIds=new Set(bcBRCs.flatMap(b=>(b.irm_allocations||[]).map(a=>String(a.irmId))));
                        const bcIRMs=allIRMsAll.filter(i=>bcIRMIds.has(String(i.id)));
                        // Payment totals: sum of IRM amounts allocated in linked BRCs
                        // Payment per invoice, with bank charges absorbed on first IRM link
                        const totPmtUSD=(bc.linked_invoices||[]).reduce((s,inv)=>s+calcEffectivePaid(inv,allBRCsAll,allIRMsAll).paidUSD,0);
                        const totPmtINR=(bc.linked_invoices||[]).reduce((s,inv)=>s+calcEffectivePaid(inv,allBRCsAll,allIRMsAll).paidINR,0);
                        return(
                          <>
                            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,borderTop:"1px solid #f1f5f9",paddingTop:8}}>
                              <div>
                                <div style={{fontSize:10,fontWeight:700,color:"#64748b",marginBottom:4}}>IRM ENTRIES ({bcIRMs.length})</div>
                                {bcIRMs.map(irm=>(
                                  <div key={irm.id} style={{fontSize:11,color:"#374151",marginBottom:2}}>
                                    <strong>{irm.irm_no}</strong> · {fU(irm.irm_total_usd||irm.irm_amt_usd)} · {irm.irm_date}
                                  </div>
                                ))}
                                {!bcIRMs.length&&<div style={{fontSize:11,color:"#94a3b8"}}>None</div>}
                              </div>
                              <div>
                                <div style={{fontSize:10,fontWeight:700,color:"#64748b",marginBottom:4}}>BRC ENTRIES ({bcBRCs.length})</div>
                                {bcBRCs.map(brc=>(
                                  <div key={brc.id} style={{fontSize:11,color:"#374151",marginBottom:2}}>
                                    <strong>{brc.brc_no||"—"}</strong> · {fU(brc.brc_amt_usd)}{brc.linked_invoice_no?" · "+brc.linked_invoice_no:""}
                                  </div>
                                ))}
                                {!bcBRCs.length&&<div style={{fontSize:11,color:"#94a3b8"}}>None</div>}
                              </div>
                            </div>
                            {(totPmtUSD>0||totPmtINR>0)&&(
                              <div style={{display:"flex",gap:20,background:"#f0fdf4",borderRadius:6,padding:"6px 10px",marginTop:6,fontSize:12}}>
                                <span>💰 Payment Rcvd: <strong style={{color:"#15803d"}}>{fU(totPmtUSD)}</strong></span>
                                <span><strong style={{color:"#166534"}}>{fR(totPmtINR)}</strong></span>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {tab==="contracts"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:10,marginBottom:14}}>
              <div><h2 style={{margin:"0 0 2px",color:"#1e3a5f",fontSize:17}}>Sales Contracts</h2><p style={{margin:0,fontSize:11,color:"#64748b"}}>{contracts.length} contracts</p></div>
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                {canManageContracts&&<button onClick={()=>{setEditContract(null);setShowContractForm(true);}} style={{background:"linear-gradient(135deg,#1e3a5f,#16a34a)",color:"#fff",border:"none",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontWeight:600,fontSize:12}}>+ New Contract</button>}
              </div>
            </div>
            <div style={{marginBottom:10}}><input value={contractSearch} onChange={e=>setContractSearch(e.target.value)} placeholder="Search contracts..." style={{...iS,fontSize:13}}/></div>
            {contracts.length===0
              ?<div style={{background:"#fff",borderRadius:12,padding:40,textAlign:"center",color:"#94a3b8"}}><div style={{fontSize:32,marginBottom:8}}>📋</div><div style={{fontSize:14,fontWeight:600}}>No contracts yet</div>{canManageContracts&&<button onClick={()=>{setEditContract(null);setShowContractForm(true);}} style={{background:"linear-gradient(135deg,#1e3a5f,#16a34a)",color:"#fff",border:"none",borderRadius:8,padding:"8px 16px",cursor:"pointer",fontWeight:600,marginTop:10}}>+ Create First Contract</button>}</div>
              :<div style={{display:"grid",gap:12}}>
                {contracts.filter(c=>!contractSearch||JSON.stringify(c).toLowerCase().includes(contractSearch.toLowerCase())).map(c=>{
                  const buyer=buyers.find(b=>b.id===c.buyer_id);
                  const statusColors={draft:{bg:"#fef3c7",color:"#d97706"},final:{bg:"#dcfce7",color:"#16a34a"},cancelled:{bg:"#fee2e2",color:"#dc2626"}};
                  const sc=statusColors[c.status]||statusColors.draft;
                  return(
                    <div key={c.id} style={{background:"#fff",borderRadius:12,overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,0.07)"}}>
                      <div style={{background:"linear-gradient(135deg,#1e3a5f,#1e5799)",padding:"11px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
                        <div>
                          <span style={{fontWeight:700,color:"#fff",fontSize:14}}>{c.contract_no}</span>
                          <span style={{marginLeft:10,fontSize:12,color:"#93c5fd"}}>{c.contract_date} · {c.buyer_name}</span>
                        </div>
                        <div style={{display:"flex",gap:6,alignItems:"center"}}>
                          <span style={{background:sc.bg,color:sc.color,borderRadius:20,padding:"3px 10px",fontSize:11,fontWeight:700,textTransform:"capitalize"}}>{c.status}</span>
                          {c.approval_status==="pending"&&<span style={{background:"#fef3c7",color:"#d97706",borderRadius:20,padding:"3px 10px",fontSize:10,fontWeight:700}}>⏳ Pending Approval</span>}
                          <button onClick={()=>exportContractPDF(c,buyer,buyers.find(b=>b.id===c.consignee_id)||null)} style={{background:"rgba(255,255,255,0.15)",color:"#fff",border:"none",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:600}}>📄 PDF</button>
                          <button onClick={()=>exportContractWord(c,buyer,buyers.find(b=>b.id===c.consignee_id)||null).catch(e=>{alert("Word export failed: "+e.message);console.error(e);})} style={{background:"rgba(99,179,237,0.25)",color:"#bfdbfe",border:"1px solid rgba(99,179,237,0.4)",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:600}}>📝 Word</button>
                          <button onClick={()=>setPiModal({contract:c,buyer})} style={{background:"rgba(251,191,36,0.25)",color:"#fde68a",border:"1px solid rgba(251,191,36,0.4)",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:600}}>🧾 PI</button>
                          {canManageContracts&&<button onClick={()=>{setEditContract(c);setShowContractForm(true);}} style={{background:"rgba(255,255,255,0.15)",color:"#fff",border:"none",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:600}}>Edit</button>}
                          {canDeleteContracts&&<button onClick={()=>deleteContract(c.id)} style={{background:"rgba(220,38,38,0.3)",color:"#fca5a5",border:"none",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:11}}>Del</button>}
                        </div>
                      </div>
                      <div style={{padding:"12px 16px"}}>
                        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:8,fontSize:12}}>
                          <div><span style={{color:"#94a3b8",fontSize:11}}>Commodity</span><div style={{fontWeight:600,color:"#1e293b"}}>{c.commodity}</div></div>
                          {(c.items&&c.items.length>1)?(
                            <div style={{gridColumn:"1/-1"}}>
                              <span style={{color:"#94a3b8",fontSize:11}}>Items ({c.items.length})</span>
                              <div style={{display:"grid",gap:4,marginTop:3}}>
                                {(c.items||[]).map((it,i)=>(
                                  <div key={i} style={{fontSize:11,background:"#f8fafc",borderRadius:5,padding:"4px 8px",display:"flex",gap:8,flexWrap:"wrap"}}>
                                    <span style={{fontWeight:600,color:"#1e3a5f"}}>({i+1}) {it.packing}</span>
                                    <span style={{color:"#64748b"}}>{it.quantity_mt} MTS</span>
                                    {it.container_qty&&<span style={{color:"#64748b"}}>{it.container_qty}×{it.container_type}</span>}
                                    {it.price_usd&&<span style={{color:"#16a34a",fontWeight:600}}>USD {it.price_usd}/{it.price_per||"MTs"}</span>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ):(
                            <>
                              <div><span style={{color:"#94a3b8",fontSize:11}}>Packing</span><div style={{fontWeight:600,color:"#1e293b"}}>{(c.items&&c.items[0]?.packing)||c.packing||"—"}</div></div>
                              <div><span style={{color:"#94a3b8",fontSize:11}}>Price</span><div style={{fontWeight:700,color:"#1e3a5f"}}>USD {(c.items&&c.items[0]?.price_usd)||c.price_usd} / {(c.items&&c.items[0]?.price_per)||c.price_per} {c.delivery_terms}</div></div>
                            </>
                          )}
                          <div><span style={{color:"#94a3b8",fontSize:11}}>Shipment Period</span><div style={{fontWeight:600,color:"#1e293b"}}>{c.shipment_period}</div></div>
                          <div><span style={{color:"#94a3b8",fontSize:11}}>Destination</span><div style={{fontWeight:600,color:"#1e293b"}}>{c.destination}</div></div>
                          <div><span style={{color:"#94a3b8",fontSize:11}}>Payment</span><div style={{fontWeight:600,color:"#16a34a"}}>{c.payment_condition}</div></div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>}
          </div>
        )}

      {/* ── Modals ── */}
      {showShipForm&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:12}}>
          <div style={{background:"#fff",borderRadius:14,padding:18,width:"100%",maxWidth:780,maxHeight:"93vh",overflow:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
            <h3 style={{margin:"0 0 4px",color:"#1e3a5f",fontSize:14}}>{resubmitPcId?"Resubmit Corrected Entry":editShipId?"Edit":"Add"} Shipment</h3>
            <p style={{margin:"0 0 12px",fontSize:11,color:"#64748b"}}>FY determined by invoice date.</p>
            {SHIP_SECTIONS.map(sec=>(
              <div key={sec.title} style={{marginBottom:12}}>
                <SH t={sec.title}/>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  {sec.fields.map(([key,label,type,opts])=>(
                    <div key={key}>
                      <label style={{fontSize:11,fontWeight:600,color:"#374151",display:"block",marginBottom:2}}>{label}</label>
                      {type==="select"?<select value={shipForm[key]||""} onChange={e=>setSF(key,e.target.value)} style={iS}><option value="">Select...</option>{opts.map(o=><option key={o}>{o}</option>)}</select>:<input type={type} value={shipForm[key]||""} onChange={e=>setSF(key,e.target.value)} style={iS} step={type==="number"?"any":undefined}/>}
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {shipForm.invoice_date&&<div style={{background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:6,padding:"6px 10px",marginBottom:10,fontSize:11,color:"#1d4ed8"}}>FY: {getFY(shipForm.invoice_date)}</div>}
            <SH t="Auto-Calculated" color="#0369a1" bg="#e0f2fe"/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
              {[["Invoice Amount (USD)",fU(shipCalc.invoiceAmtUSD)],["Invoice Amount (INR)",fR(shipCalc.invoiceAmtINR)],["Gross Total (INR)",fR(shipCalc.grossTotal)],["FOB Value (INR)",fR(shipCalc.fobValueINR)]].map(([l,v])=><div key={l}><label style={{fontSize:11,fontWeight:600,color:"#0369a1",display:"block",marginBottom:2}}>{l}</label><input readOnly value={v} style={cS}/></div>)}
            </div>

            <div style={{marginBottom:10}}><label style={{fontSize:11,fontWeight:600,color:"#374151",display:"block",marginBottom:2}}>Remarks</label><textarea value={shipForm.remarks||""} onChange={e=>setSF("remarks",e.target.value)} rows={2} style={{...iS,resize:"vertical"}}/></div>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
              <button onClick={()=>setShowShipForm(false)} style={{background:"#f1f5f9",color:"#64748b",border:"none",borderRadius:8,padding:"8px 16px",cursor:"pointer",fontWeight:600,fontSize:13}}>Cancel</button>
              <button onClick={saveShip} disabled={saving} style={{background:"linear-gradient(135deg,#1e3a5f,#16a34a)",color:"#fff",border:"none",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontWeight:700,fontSize:13}}>{saving?"Saving...":"Save"}</button>
            </div>
          </div>
        </div>
      )}

      {showProfit&&<ProfitFormModal fy={fy} editId={editProfitId} form={profitForm} calc={profitCalc} fyShips={fyShips} setF={setPF} onSelectInvoice={selectProfitInv} onSave={saveProfit} onClose={()=>setShowProfit(false)} saving={saving}/>}
      {showBC&&<BCModal bc={editBC} allShips={ships} allBCs={bcs} allIRMs={[...bcs.flatMap(b=>b.irm_entries||[]),...standaloneIRMs]} allBRCs={[...bcs.flatMap(b=>b.brc_entries||[]),...standaloneBRCs]} onSave={saveBC} onClose={()=>{setShowBC(false);setEditBC(null);}} saving={saving}/>}
      {irmModal&&<IRMModal irm={irmModal.irm} allIRMs={[...bcs.flatMap(b=>b.irm_entries||[]),...standaloneIRMs]} onSave={async(f)=>{
        setSaving(true);
        try{
          if(f.id){
            await sb(`irm_entries?id=eq.${f.id}`,{method:"PATCH",body:JSON.stringify({irm_no:f.irm_no,irm_date:f.irm_date||null,irm_total_usd:n(f.irm_total_usd),irm_amt_usd:n(f.irm_total_usd),exchange_rate:n(f.exchange_rate),irm_amt_inr:n(f.irm_amt_inr),intermediary_charges_usd:n(f.intermediary_charges_usd||0)})});
          } else {
            await sb("irm_entries",{method:"POST",body:JSON.stringify({bc_id:null,irm_no:f.irm_no,irm_date:f.irm_date||null,irm_total_usd:n(f.irm_total_usd),irm_amt_usd:n(f.irm_total_usd),exchange_rate:n(f.exchange_rate),irm_amt_inr:n(f.irm_amt_inr),intermediary_charges_usd:n(f.intermediary_charges_usd||0),allocations:[]})});
          }
          await loadAll(); setIrmModal(null);
        }catch(e){alert("Error saving IRM: "+e.message);}
        setSaving(false);
      }} onClose={()=>setIrmModal(null)} saving={saving}/>}
      {brcModal&&<BRCModal brc={brcModal.brc} allBRCs={[...bcs.flatMap(b=>b.brc_entries||[]),...standaloneBRCs]} allIRMs={[...bcs.flatMap(b=>b.irm_entries||[]),...standaloneIRMs]} allShips={ships} allBCs={bcs} onSave={async(f)=>{
        setSaving(true);
        try{
          const payload={brc_no:f.brc_no,brc_date:f.brc_date||null,brc_amt_usd:n(f.brc_amt_usd),linked_invoice_no:f.linked_invoice_no||null,irm_allocations:f.irm_allocations||[]};
          if(f.id){
            await sb(`brc_entries?id=eq.${f.id}`,{method:"PATCH",body:JSON.stringify(payload)});
          } else {
            await sb("brc_entries",{method:"POST",body:JSON.stringify({...payload,bc_id:null})});
          }
          await loadAll(); setBrcModal(null);
        }catch(e){alert("Error: "+e.message);}
        setSaving(false);
      }} onClose={()=>setBrcModal(null)} saving={saving}/>}
      {viewShipId&&<DetailModal shipment={viewShip} bc={viewShip?getBC(viewShip):null} allBRCs={[...bcs.flatMap(b=>b.brc_entries||[]),...standaloneBRCs]} allIRMs={[...bcs.flatMap(b=>b.irm_entries||[]),...standaloneIRMs]} onClose={()=>setViewShipId(null)} onViewDocs={()=>setShipDocsId(viewShipId)}/>}
      {showUsers&&<UserModal users={users} onClose={()=>setShowUsers(false)} onRefresh={loadAll}/>}
      {showChangePwd&&<ChangePwdModal onClose={()=>setShowChangePwd(false)}/>}
      {shareText&&<ShareModal text={shareText} onClose={()=>setShareText(null)}/>}

      {showImport&&<ImportModal onImport={doImport} onClose={()=>setShowImport(false)}/>}

      {exportModal&&(
        <ExportModal
          type={exportModal}
          data={exportData}
          getBC={getBC}
          onClose={()=>setExportModal(null)}
        />
      )}

      {shipDocsId&&ships.find(x=>x.id===shipDocsId)&&<ShipDocsModal shipment={ships.find(x=>x.id===shipDocsId)} canUpload={canEdit} canDelete={isAdmin||isSeniorAccountant} onClose={()=>setShipDocsId(null)}/>}
      {bcDocsId&&bcs.find(x=>x.id===bcDocsId)&&<BCDocsModal bc={bcs.find(x=>x.id===bcDocsId)} canUpload={canEditBC} canDelete={isAdmin||isSeniorAccountant} onClose={()=>setBCDocsId(null)}/>}
      {irmDocsModal&&<IRMDocsModal irm={irmDocsModal.irm||irmDocsModal} canUpload={canEditBC} canDelete={isAdmin||isSeniorAccountant} onClose={()=>setIrmDocsModal(null)}/>}
      {brcDocsModal&&<BRCDocsModal brc={brcDocsModal.brc||brcDocsModal} canUpload={canEditBC} canDelete={isAdmin||isSeniorAccountant} onClose={()=>setBrcDocsModal(null)}/>}
      {showApprovals&&<ApprovalsModal
          pendings={pendings} userInfo={userInfo}
          onClose={()=>setShowApprovals(false)} onRefresh={loadAll} ships={ships}
          onResubmit={pc=>{
            setShowApprovals(false);
            const data=pc.new_data||{};
            setShipForm({...EMPTY_SHIP,...data});
            setEditShipId(data.id||pc.record_id||null);
            setResubmitPcId(pc.id);
            setShowShipForm(true);
          }}
          onDeleteRejected={async id=>{
            if(!window.confirm("Discard this rejected entry?"))return;
            await sb(`pending_changes?id=eq.${id}`,{method:"DELETE"});
            loadAll();
          }}
        />}

      {showBuyerForm&&<BuyerFormModal buyer={editBuyer} onSave={saveBuyer} onClose={()=>{setShowBuyerForm(false);setEditBuyer(null);}} saving={saving}/>}

      {/* ── Proforma Invoice Modal ── */}
      {piModal&&(
        <ProformaInvoiceModal
          contract={piModal.contract}
          buyer={piModal.buyer}
          onClose={()=>setPiModal(null)}
          onSave={async(fields)=>{
            if(!piModal.contract.id) return;
            try {
              await sb(`contracts?id=eq.${piModal.contract.id}`, {
                method:"PATCH",
                body: JSON.stringify(fields)
              });
              loadAll();
            } catch(e) { console.error("PI save error",e); }
          }}
        />
      )}
      {showContractForm&&<ContractFormModal contract={editContract} buyers={buyers} userInfo={userInfo} onSave={saveContract} onClose={()=>{setShowContractForm(false);setEditContract(null);}} saving={saving}/>}

      {deleteId&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100}}>
          <div style={{background:"#fff",borderRadius:12,padding:24,width:280,textAlign:"center"}}>
            <div style={{fontSize:30,marginBottom:8}}>⚠️</div>
            <h3 style={{margin:"0 0 6px",color:"#1e3a5f",fontSize:15}}>Delete Shipment?</h3>
            <p style={{color:"#64748b",fontSize:12,marginBottom:14}}>This cannot be undone.</p>
            <div style={{display:"flex",gap:8,justifyContent:"center"}}>
              <button onClick={()=>setDeleteId(null)} style={{background:"#f1f5f9",color:"#64748b",border:"none",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontWeight:600,fontSize:13}}>Cancel</button>
              <button onClick={()=>deleteShip(deleteId)} disabled={saving} style={{background:"#dc2626",color:"#fff",border:"none",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontWeight:700,fontSize:13}}>{saving?"Deleting...":"Delete"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
