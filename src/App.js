import { useState, useEffect, useMemo, useCallback, useRef } from "react";

const SUPABASE_URL = "https://jqbagmezerzgewxaqtpt.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxYmFnbWV6ZXJ6Z2V3eGFxdHB0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyMjMxMjIsImV4cCI6MjA5NTc5OTEyMn0.HAG23sw41cMXiyrnTC2-9dTZn5bO0oXMc69XKwB3IkU";
const R2_WORKER = "https://devratan-r2-worker.mittal94.workers.dev";
const APP_VERSION = "1.0.3"; // ← Increment this on every deployment to force logout all users

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
  {key:"bc_ref_copy",   label:"BC Reference Copy",   accept:".pdf", maxMB:3},
];

const r2Upload = async (folder, docKey, file) => {
  const ext = file.name.split(".").pop();
  const key = `${folder}/${docKey}/${docKey}.${ext}`;
  const res = await fetch(`${R2_WORKER}/${key}`, {
    method:"PUT", headers:{"Content-Type":file.type||"application/octet-stream"},
    body: file
  });
  if(!res.ok) throw new Error("Upload failed");
  return key;
};

const r2Delete = async (key) => {
  const res = await fetch(`${R2_WORKER}/${key}`, {method:"DELETE"});
  if(!res.ok) throw new Error("Delete failed");
};

const r2List = async (folder) => {
  const res = await fetch(`${R2_WORKER}/list/${folder}`);
  if(!res.ok) return [];
  const data = await res.json();
  return data.files||[];
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

const COMPANY = { name: "DEVRATAN ENTERPRISES LLP", tagline: "We Create Not Produce", address: "Off No 206, II Floor, Indore Trade Center, Madhumilan Square, Indore MP 452001" };
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

const calcProfit = p => {
  const rice=n(p.rice_purchase_val), interest=rice*0.01, bankCh=n(p.payment_received_inr)*0.0011;
  const localBrokerage=n(p.qty_mt)*100;
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

const exportProfitPDF = (p) => {
  const JPDF = getPDF();
  if(!JPDF){ alert("PDF library not loaded. Please refresh the page."); return; }
  const doc = new JPDF({orientation:'portrait',unit:'mm',format:'a4'});
  const c = calcProfit(p);
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
          const c = calcProfit(p);
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
        const c = calcProfit(p);
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

function BCModal({bc,allShips,onSave,onClose,saving}){
  const mkIRM=()=>({id:Date.now()+Math.random(),irmNo:"",irmDate:"",irmAmtUSD:"",exchangeRate:"",irmAmtINR:0,intermediaryChargesUSD:""});
  const mkBRC=()=>({id:Date.now()+Math.random(),brcNo:"",brcDate:"",brcAmtUSD:""});
  const [form,setForm]=useState(()=>{
    if(bc){return{...bc,irm_entries:bc.irm_entries?.map(i=>({id:i.id,irmNo:i.irm_no,irmDate:i.irm_date,irmAmtUSD:i.irm_amt_usd,exchangeRate:i.exchange_rate,irmAmtINR:i.irm_amt_inr,intermediaryChargesUSD:i.intermediary_charges_usd||0}))||[mkIRM()],brc_entries:bc.brc_entries?.map(b=>({id:b.id,brcNo:b.brc_no,brcDate:b.brc_date,brcAmtUSD:b.brc_amt_usd}))||[mkBRC()]};}
    return{id:null,bank_name:"SBI",bc_no:"",bc_date:"",linked_invoices:[],irm_entries:[mkIRM()],brc_entries:[mkBRC()],total_amt_usd:0,total_amt_inr:0};
  });
  const sf=(k,v)=>setForm(f=>({...f,[k]:v}));
  const updIRM=(id,k,v)=>setForm(f=>({...f,irm_entries:f.irm_entries.map(i=>{if(i.id!==id)return i;const u={...i,[k]:v};if(k==="irmAmtUSD"||k==="exchangeRate")u.irmAmtINR=n(k==="irmAmtUSD"?v:u.irmAmtUSD)*n(k==="exchangeRate"?v:u.exchangeRate);return u;})}));
  const updBRC=(id,k,v)=>setForm(f=>({...f,brc_entries:f.brc_entries.map(b=>b.id!==id?b:{...b,[k]:v})}));
  const togInv=inv=>sf("linked_invoices",form.linked_invoices?.includes(inv)?form.linked_invoices.filter(x=>x!==inv):[...(form.linked_invoices||[]),inv]);
  const totUSD=form.irm_entries?.reduce((s,i)=>s+n(i.irmAmtUSD)+n(i.intermediaryChargesUSD),0)||0;
  const totINR=form.irm_entries?.reduce((s,i)=>s+n(i.irmAmtINR),0)||0;
  const save=()=>{if(!form.bc_no){alert("BC No required.");return;}onSave({...form,total_amt_usd:totUSD,total_amt_inr:totINR});};
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:12}}>
      <div style={{background:"#fff",borderRadius:14,padding:24,width:"100%",maxWidth:820,maxHeight:"95vh",overflow:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.35)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}><h3 style={{margin:0,color:"#1e3a5f",fontSize:17}}>{bc?"Edit":"Create"} Bill Collection</h3><button onClick={onClose} style={{background:"#f1f5f9",border:"none",borderRadius:6,padding:"5px 12px",cursor:"pointer",fontWeight:600}}>X</button></div>
        <SH t="Bank Details"/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
          <div><label style={{fontSize:11.5,fontWeight:600,color:"#374151",display:"block",marginBottom:3}}>Bank</label><select value={form.bank_name||"SBI"} onChange={e=>sf("bank_name",e.target.value)} style={iS}>{BANKS.map(b=><option key={b}>{b}</option>)}</select></div>
          <div><label style={{fontSize:11.5,fontWeight:600,color:"#374151",display:"block",marginBottom:3}}>BC No *</label><input value={form.bc_no||""} onChange={e=>sf("bc_no",e.target.value)} style={iS}/></div>
          <div><label style={{fontSize:11.5,fontWeight:600,color:"#374151",display:"block",marginBottom:3}}>BC Date</label><input type="date" value={form.bc_date||""} onChange={e=>sf("bc_date",e.target.value)} style={iS}/></div>
        </div>
        <SH t="Linked Invoices"/>
        <div style={{display:"flex",flexWrap:"wrap",gap:8}}>{allShips.map(s=>{const lk=form.linked_invoices?.includes(s.invoice_no);return<button key={s.id} onClick={()=>togInv(s.invoice_no)} style={{background:lk?"#1e3a5f":"#f1f5f9",color:lk?"#fff":"#64748b",border:lk?"none":"1px solid #e2e8f0",borderRadius:20,padding:"4px 12px",cursor:"pointer",fontSize:12,fontWeight:lk?700:400}}>{s.invoice_no}</button>;})}</div>
        <SH t="IRM Entries"/>
        {form.irm_entries?.map((irm,idx)=>(
          <div key={irm.id} style={{background:"#f8fafc",borderRadius:10,padding:14,marginBottom:10,border:"1px solid #e2e8f0"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}><span style={{fontWeight:700,color:"#1e3a5f",fontSize:13}}>IRM #{idx+1}</span>{form.irm_entries.length>1&&<button onClick={()=>setForm(f=>({...f,irm_entries:f.irm_entries.filter(i=>i.id!==irm.id)}))} style={{background:"#fee2e2",color:"#dc2626",border:"none",borderRadius:5,padding:"3px 9px",cursor:"pointer",fontSize:11}}>Remove</button>}</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
              {[["irmNo","IRM No","text"],["irmDate","IRM Date","date"],["irmAmtUSD","IRM Amt (USD)","number"],["exchangeRate","Exchange Rate","number"],["intermediaryChargesUSD","Intermediary Charges (USD)","number"]].map(([k,l,t])=><div key={k}><label style={{fontSize:11.5,fontWeight:600,color:"#374151",display:"block",marginBottom:3}}>{l}</label><input type={t} value={irm[k]||""} onChange={e=>updIRM(irm.id,k,e.target.value)} style={iS} step={t==="number"?"any":undefined}/></div>)}
              <div><label style={{fontSize:11.5,fontWeight:600,color:"#0369a1",display:"block",marginBottom:3}}>IRM Amt (INR) Auto</label><input readOnly value={fR(irm.irmAmtINR||0)} style={cS}/></div>
            </div>
          </div>
        ))}
        <button onClick={()=>setForm(f=>({...f,irm_entries:[...f.irm_entries,mkIRM()]}))} style={{background:"#eff6ff",color:"#1d4ed8",border:"1px solid #bfdbfe",borderRadius:6,padding:"5px 12px",cursor:"pointer",fontSize:12,fontWeight:600,marginBottom:4}}>+ Add IRM</button>
        <SH t="BRC Entries"/>
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
          <button onClick={save} disabled={saving} style={{background:"linear-gradient(135deg,#1e3a5f,#16a34a)",color:"#fff",border:"none",borderRadius:8,padding:"8px 24px",cursor:"pointer",fontWeight:700}}>{saving?"Saving...":"Save BC"}</button>
        </div>
      </div>
    </div>
  );
}


// ─── Ship Documents Modal ────────────────────────────────────────────────────
function ShipDocsModal({shipment, canUpload, canDelete, onClose}){
  const [files, setFiles] = useState({});
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState({});
  const [deleting, setDeleting] = useState({});
  const fileRefs = useRef({});
  const folder = `shipments/${shipment.invoice_no}`;

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

  const handleUpload = async (docKey, file, maxMB, accept) => {
    // Validate format
    const ext = "."+file.name.split(".").pop().toLowerCase();
    const allowed = accept.split(",");
    if(!allowed.includes(ext)) { alert(`Invalid format. Allowed: ${accept}`); return; }
    // Validate size
    if(file.size > maxMB*1024*1024) { alert(`File too large. Max size: ${maxMB}MB`); return; }
    setUploading(u => ({...u, [docKey]:true}));
    try {
      // Delete old if exists
      if(files[docKey]) await r2Delete(files[docKey].key);
      await r2Upload(folder, docKey, file);
      await loadFiles();
    } catch(e) { alert("Upload failed: "+e.message); }
    setUploading(u => ({...u, [docKey]:false}));
  };

  const handleDelete = async (docKey) => {
    if(!window.confirm("Delete this document?")) return;
    setDeleting(d => ({...d, [docKey]:true}));
    try {
      await r2Delete(files[docKey].key);
      await loadFiles();
    } catch(e) { alert("Delete failed: "+e.message); }
    setDeleting(d => ({...d, [docKey]:false}));
  };

  const fmtSize = bytes => bytes < 1024*1024 ? (bytes/1024).toFixed(0)+"KB" : (bytes/1024/1024).toFixed(1)+"MB";

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:10}}>
      <div style={{background:"#fff",borderRadius:14,width:"100%",maxWidth:640,maxHeight:"95vh",overflow:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.35)"}}>
        <div style={{background:"linear-gradient(135deg,#1e3a5f,#1e5799)",padding:"14px 18px",display:"flex",justifyContent:"space-between",alignItems:"center",position:"sticky",top:0,zIndex:10}}>
          <div>
            <div style={{fontWeight:700,color:"#fff",fontSize:14}}>📁 Documents — {shipment.invoice_no}</div>
            <div style={{fontSize:11,color:"#93c5fd"}}>{shipment.buyer_name} · {shipment.invoice_date}</div>
          </div>
          <button onClick={onClose} style={{background:"rgba(255,255,255,0.2)",border:"none",color:"#fff",borderRadius:6,padding:"5px 12px",cursor:"pointer",fontWeight:600}}>✕</button>
        </div>

        {loading ? (
          <div style={{padding:30,textAlign:"center",color:"#64748b"}}>Loading documents...</div>
        ) : (
          <div style={{padding:14}}>
            <div style={{display:"grid",gap:8}}>
              {SHIP_DOCS.map(doc => {
                const uploaded = files[doc.key];
                const isUploading = uploading[doc.key];
                const isDeleting = deleting[doc.key];
                return(
                  <div key={doc.key} style={{background:uploaded?"#f0fdf4":"#f8fafc",border:`1px solid ${uploaded?"#86efac":"#e2e8f0"}`,borderRadius:10,padding:"10px 12px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:12,fontWeight:600,color:"#1e293b"}}>{doc.label}</div>
                      <div style={{fontSize:10,color:"#94a3b8"}}>{doc.accept.replace(/\./g,"").toUpperCase()} · Max {doc.maxMB}MB</div>
                      {uploaded && (
                        <div style={{fontSize:10,color:"#16a34a",marginTop:2}}>
                          ✅ {fmtSize(uploaded.size)} · {new Date(uploaded.uploaded).toLocaleDateString("en-IN")}
                        </div>
                      )}
                    </div>
                    <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
                      {uploaded && (
                        <a href={r2ViewUrl(uploaded.key)} target="_blank" rel="noreferrer" style={{background:"#dbeafe",color:"#1d4ed8",borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:600,textDecoration:"none"}}>
                          👁 View
                        </a>
                      )}
                      {canUpload && (
                        <>
                          <input
                            type="file"
                            accept={doc.accept}
                            ref={el => fileRefs.current[doc.key]=el}
                            onChange={e => { const f=e.target.files[0]; if(f) handleUpload(doc.key,f,doc.maxMB,doc.accept); e.target.value=""; }}
                            style={{display:"none"}}
                          />
                          <button
                            onClick={() => fileRefs.current[doc.key]?.click()}
                            disabled={isUploading}
                            style={{background:uploaded?"#fef3c7":"#dcfce7",color:uploaded?"#d97706":"#16a34a",border:"none",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:600}}
                          >
                            {isUploading?"⏳":uploaded?"🔄 Replace":"⬆ Upload"}
                          </button>
                        </>
                      )}
                      {canDelete && uploaded && (
                        <button
                          onClick={() => handleDelete(doc.key)}
                          disabled={isDeleting}
                          style={{background:"#fee2e2",color:"#dc2626",border:"none",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:11,fontWeight:600}}
                        >
                          {isDeleting?"⏳":"🗑"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{marginTop:12,padding:"10px 12px",background:"#eff6ff",borderRadius:8,fontSize:11,color:"#1d4ed8"}}>
              📌 {Object.keys(files).length} of {SHIP_DOCS.length} documents uploaded
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── BC Documents Modal ──────────────────────────────────────────────────────
function BCDocsModal({bc, canUpload, canDelete, onClose}){
  const [files, setFiles] = useState({});
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState({});
  const [deleting, setDeleting] = useState({});
  const fileRefs = useRef({});
  const folder = `bc/${bc.bc_no}`;

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
      await r2Upload(folder, docKey, file);
      await loadFiles();
    } catch(e){ alert("Upload failed: "+e.message); }
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

  // Build full doc list: BC ref + IRM wise + BRC wise
  const allDocs = [
    ...BC_DOCS,
    ...(bc.irm_entries||[]).map((irm,i) => ({key:`irm_${i}`, label:`IRM Copy — ${irm.irm_no||"IRM #"+(i+1)}`, accept:".pdf", maxMB:3})),
    ...(bc.brc_entries||[]).map((brc,i) => ({key:`brc_${i}`, label:`BRC Copy — ${brc.brc_no||"BRC #"+(i+1)}`, accept:".pdf", maxMB:3})),
  ];

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
            <div style={{display:"grid",gap:8}}>
              {allDocs.map(doc=>{
                const uploaded=files[doc.key];
                const isUploading=uploading[doc.key];
                const isDeleting=deleting[doc.key];
                return(
                  <div key={doc.key} style={{background:uploaded?"#f0fdf4":"#f8fafc",border:`1px solid ${uploaded?"#86efac":"#e2e8f0"}`,borderRadius:10,padding:"10px 12px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:12,fontWeight:600,color:"#1e293b"}}>{doc.label}</div>
                      <div style={{fontSize:10,color:"#94a3b8"}}>PDF only · Max {doc.maxMB}MB</div>
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
              })}
            </div>
            <div style={{marginTop:12,padding:"10px 12px",background:"#f0fdf4",borderRadius:8,fontSize:11,color:"#15803d"}}>
              📌 {Object.keys(files).length} of {allDocs.length} documents uploaded
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DetailModal({shipment,bc,onClose,onViewDocs}){
  if(!shipment)return <span/>;
  const s=shipment,c=calcShip(s);
  const brcNos=bc?bc.brc_entries?.map(b=>b.brc_no).filter(Boolean).join(", "):"—";
  const brcDates=bc?bc.brc_entries?.map(b=>b.brc_date).filter(Boolean).join(", "):"—";
  const rows=[["FY",getFY(s.invoice_date)],["Invoice Date",s.invoice_date],["Buyer",s.buyer_name],["Country",s.buyer_country],["Product",s.product],["Port of Loading",s.port_of_loading],["Port of Discharge",s.port_of_discharge],["SB No",s.shipping_bill_no],["SB Date",s.shipping_bill_date],["Port Code",s.port_code],["BL No",s.bl_no],["BL Date",s.bl_date],["Qty (MT)",fi(s.qty)],["Rate/MT (USD)",fi(s.rate_per_mt)],["Delivery Terms",s.delivery_terms],["Invoice Amt (USD)",fU(c.invoiceAmtUSD)],["Exchange Rate",fi(s.exchange_rate)],["Invoice Amt (INR)",fR(c.invoiceAmtINR)],["IGST (INR)",fR(s.igst)],["Gross Total (INR)",fR(c.grossTotal)],["FOB (USD)",fU(s.fob_value_usd)],["FOB (INR)",fR(c.fobValueINR)],["RODTEP (INR)",fR(s.rodtep_amount)],["RODTEP Status",s.rodtep_status],["GST Status",s.gst_status],["Bill Collection No",bc?bc.bc_no:"—"],["BC Date",bc?bc.bc_date:"—"],["BRC No(s)",brcNos],["BRC Date(s)",brcDates],["Payment Rcvd (USD)",bc?fU(bc.total_amt_usd):"—"],["Payment Rcvd (INR)",bc?fR(bc.total_amt_inr):"—"],["Balance (USD)",bc?fU(c.invoiceAmtUSD-bc.total_amt_usd):fU(c.invoiceAmtUSD)],["Remarks",s.remarks||"—"]];
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

function ProfitabilityContent({fy,fyProfits,canEdit,canDelete,openAddProfit,openEditProfit,onDelete,onExportSingle}){
  const totP=fyProfits.reduce((a,p)=>{
    try{ const c=calcProfit(p); a.invINR+=n(p.invoice_amt_inr); a.paidINR+=n(p.payment_received_inr); a.totalCIF+=c.totalCIF; a.profit+=c.profit; }catch(e){}
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
            try{c=calcProfit(p);}catch(e){}
            return(
              <div key={p.id} style={{background:"#fff",borderRadius:12,overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,0.07)"}}>
                <div style={{background:"linear-gradient(135deg,#1e3a5f,#1e5799)",padding:"11px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
                  <div><span style={{fontWeight:700,color:"#fff",fontSize:14}}>{p.invoice_no}</span><span style={{marginLeft:10,fontSize:12,color:"#93c5fd"}}>{p.invoice_date} · {p.buyer_name}</span></div>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <div style={{textAlign:"right"}}><div style={{fontSize:10,color:"#93c5fd"}}>Net Profit</div><div style={{fontSize:17,fontWeight:700,color:c.profit>=0?"#86efac":"#fca5a5"}}>{fR(c.profit)}</div></div>
                    <button onClick={()=>exportProfitPDF(p)} style={{background:"rgba(255,255,255,0.15)",color:"#fff",border:"none",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:11,fontWeight:600}}>📄 PDF</button>
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
  const mine=pendings.filter(p=>p.submitted_by===userId);
  const rej=mine.filter(p=>p.status==="rejected").length;
  const pend=mine.filter(p=>p.status==="pending").length;
  return(
    <button onClick={onClick} style={{background:rej>0?"rgba(239,68,68,0.8)":pend>0?"rgba(251,191,36,0.8)":"rgba(255,255,255,0.15)",border:"none",color:"#fff",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontSize:11,fontWeight:600}}>
      📋 My Requests{(rej>0||pend>0)&&<span style={{background:"#fff",color:"#1e3a5f",borderRadius:10,padding:"1px 6px",fontSize:10,fontWeight:800,marginLeft:5}}>{rej>0?rej:pend}</span>}
    </button>
  );
}

function JuniorPendingBanner({pendings,userId,onViewRejected}){
  const myPend=pendings.filter(p=>p.submitted_by===userId&&p.status==="pending");
  const myRej=pendings.filter(p=>p.submitted_by===userId&&p.status==="rejected");
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
function ApprovalsModal({pendings,userInfo,onClose,onRefresh,ships}){
  const isJunior=userInfo?.role==="junior_accountant";
  const isAdmin=userInfo?.role==="admin";
  const isSenior=userInfo?.role==="senior_accountant";
  const canReview=isAdmin||isSenior;
  const [rejectNote,setRejectNote]=useState("");
  const [rejectId,setRejectId]=useState(null);
  const [saving,setSaving]=useState(false);
  const [activeTab,setActiveTab]=useState("pending");

  const myItems=isJunior?pendings.filter(p=>p.submitted_by===userInfo?.id):pendings;
  const shown=myItems.filter(p=>p.status===activeTab);

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
            const cnt=(isJunior?pendings.filter(p=>p.submitted_by===userInfo?.id):pendings).filter(p=>p.status===t).length;
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
            const ac=actionColors[pc.action]||{bg:"#f1f5f9",color:"#64748b",label:pc.action};
            const data=pc.new_data||pc.old_data||{};
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
                    <div>{new Date(pc.submitted_at).toLocaleDateString("en-IN")} {new Date(pc.submitted_at).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}</div>
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
    contract_no:"",contract_date:today,
    buyer_id:"",buyer_name:"",buyer_address:"",
    consignee_id:"",consignee_name:"",consignee_address:"",
    commodity:"INDIAN PARBOILED RICE – 5% BROKEN",
    quantity_mt:"",quantity_tolerance:"+/- 5% at seller's option",
    container_qty:"1",container_type:"20' FCL",
    loading_port:"Any Indian Port",destination:"",
    specification:"Moisture 14% Max, Broken 5% Max, DD 2% Max, Length 5.9 mm Min",
    shipment_period:"",packing:"In 20 Kg PP Bags",
    price_usd:"",price_per:"MTs",delivery_terms:"CIF",
    payment_condition:"",
    selected_docs:DEFAULT_DOCS,
    war_risk_clause:true,
    other_doc_name:"",
    special_conditions:"",status:"draft"
  };
  const [form,setForm]=useState(()=>{
    if(contract){
      return{
        ...EMPTY,...contract,
        selected_docs:contract.selected_docs||DEFAULT_DOCS,
        war_risk_clause:contract.war_risk_clause!==undefined?contract.war_risk_clause:true,
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

        <SH t="Commodity & Quantity"/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
          <div style={{gridColumn:"1/-1"}}>{fld("commodity","Commodity")}</div>
          <div>
            <label style={{fontSize:11.5,fontWeight:600,color:"#374151",display:"block",marginBottom:3}}>Quantity (MT)</label>
            <input type="number" value={form.quantity_mt||""} onChange={e=>sf("quantity_mt",e.target.value)} style={iS} step="any" placeholder="e.g. 27"/>
          </div>
          <div>
            <label style={{fontSize:11.5,fontWeight:600,color:"#374151",display:"block",marginBottom:3}}>Tolerance</label>
            <input value={form.quantity_tolerance||""} onChange={e=>sf("quantity_tolerance",e.target.value)} style={iS} placeholder="+/- 5% at seller's option"/>
          </div>
          <div>
            <label style={{fontSize:11.5,fontWeight:600,color:"#374151",display:"block",marginBottom:3}}>No. of Containers</label>
            <input type="number" value={form.container_qty||""} onChange={e=>sf("container_qty",e.target.value)} style={iS} min="1"/>
          </div>
          <div>
            <label style={{fontSize:11.5,fontWeight:600,color:"#374151",display:"block",marginBottom:3}}>Container Type</label>
            <select value={form.container_type||""} onChange={e=>sf("container_type",e.target.value)} style={iS}>
              {CONTAINER_TYPES.map(o=><option key={o}>{o}</option>)}
            </select>
          </div>
          {form.quantity_mt&&<div style={{gridColumn:"1/-1",background:"#eff6ff",borderRadius:6,padding:"6px 10px",fontSize:11,color:"#1d4ed8"}}>
            Preview: <b>{form.quantity_mt} MTS {form.quantity_tolerance||""} {form.container_qty&&form.container_type?`${form.container_qty} x ${form.container_type}`:""}</b>
          </div>}
          {fld("specification","Specification")}
          {fld("packing","Packing")}
          {fld("shipment_period","Shipment Period (e.g. JUN-JUL 2026)")}
          {fld("loading_port","Port of Loading")}
          {fld("destination","Destination Port")}
          <div>
            <label style={{fontSize:11.5,fontWeight:600,color:"#374151",display:"block",marginBottom:3}}>Delivery Terms</label>
            <select value={form.delivery_terms||""} onChange={e=>sf("delivery_terms",e.target.value)} style={iS}>
              {DEL_TERMS.map(o=><option key={o}>{o}</option>)}
            </select>
          </div>
        </div>

        <SH t="Pricing"/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:12}}>
          {fld("price_usd","Price (USD)","number")}
          {fld("price_per","Per","select",["MTs","MT","Container","Lot"])}
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

function exportContractPDF(contract, buyer, consignee) {
  const JPDF = getPDF();
  if (!JPDF) { alert("PDF library not loaded. Please refresh and try again."); return; }
  const doc = new JPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const M = 15;
  const pw = 210 - M * 2;
  const navy  = [30, 58, 95];
  const gold  = [162, 120, 50];
  const lgold = [210, 175, 100];
  const cream = [253, 251, 246];
  const lgray = [244, 246, 249];
  const dgray = [190, 198, 210];
  const white = [255, 255, 255];
  const green = [22, 100, 50];

  // ── Watermark (logo faded) ────────────────────────────────────────────────
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
    doc.setFillColor(...gold); doc.rect(0, 0, 210, 2.5, "F");
    doc.setFillColor(...navy); doc.rect(0, 290, 210, 7, "F");
    doc.setFontSize(6.5); doc.setTextColor(...white); doc.setFont(undefined, "normal");
    doc.text(COMPANY.name + "  |  +91-9111282828  |  akshay@devratan.com  |  www.devratan.com  |  GSTIN: 23AARFD8883D1Z3  |  IEC: AARFD8883D", 105, 294, { align: "center" });
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

  // Gold top stripe
  doc.setFillColor(...gold); doc.rect(0, 0, 210, 2.5, "F");

  // Navy header bar (full width)
  doc.setFillColor(...navy); doc.rect(0, 2.5, 210, 44, "F");

  // White logo panel on left — so eagle logo is clearly visible
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...gold); doc.setLineWidth(0.5);
  doc.roundedRect(M - 1, 4, 40, 40, 2, 2, "FD");

  // Logo image inside white panel
  try {
    if (LOGO_B64) doc.addImage(LOGO_B64, "PNG", M, 5, 38, 38);
  } catch(e) {
    doc.setFontSize(9); doc.setFont(undefined, "bold"); doc.setTextColor(...navy);
    doc.text("DEVRATAN", M + 19, 18, { align: "center" });
    doc.setFontSize(5.5); doc.setFont(undefined, "normal"); doc.setTextColor(...gold);
    doc.text("ENTERPRISES LLP", M + 19, 23, { align: "center" });
    doc.text("We Create Not Produce", M + 19, 28, { align: "center" });
  }

  // Company info right of logo panel
  doc.setFontSize(11.5); doc.setFont(undefined, "bold"); doc.setTextColor(255, 255, 255);
  doc.text(COMPANY.name, M + 47, 13);
  doc.setFontSize(7); doc.setFont(undefined, "italic"); doc.setTextColor(200, 215, 240);
  doc.text(COMPANY.tagline, M + 47, 17.5);
  doc.setFont(undefined, "normal"); doc.setTextColor(210, 220, 235); doc.setFontSize(7);
  doc.text(COMPANY.address, M + 47, 22);
  doc.text("+91-9111282828  |  akshay@devratan.com  |  www.devratan.com", M + 47, 26.5);
  doc.text("GSTIN: 23AARFD8883D1Z3  |  IEC: AARFD8883D  |  LLP IN: AAV-1622", M + 47, 31);

  // SALE CONTRACT — right block
  doc.setFontSize(19); doc.setFont(undefined, "bold"); doc.setTextColor(255, 255, 255);
  doc.text("SALE CONTRACT", 210 - M, 14, { align: "right" });
  // Gold underline under title
  const tw = doc.getTextWidth("SALE CONTRACT");
  doc.setDrawColor(...gold); doc.setLineWidth(1);
  doc.line(210 - M - tw, 16, 210 - M, 16);

  // Contract No — text lines (no box, no overlap)
  doc.setFontSize(7); doc.setFont(undefined, "normal"); doc.setTextColor(...lgold);
  doc.text("CONTRACT NO.", 210 - M, 21, { align: "right" });
  doc.setFontSize(9); doc.setFont(undefined, "bold"); doc.setTextColor(255, 255, 255);
  doc.text(contract.contract_no || "---", 210 - M, 27, { align: "right" });

  // Date
  doc.setFontSize(7.5); doc.setFont(undefined, "bold"); doc.setTextColor(255, 255, 255);
  doc.text("Date: " + (contract.contract_date || ""), 210 - M, 33, { align: "right" });

  // Status badge
  if (contract.status === "final") {
    doc.setFillColor(22, 163, 74); doc.roundedRect(210 - M - 20, 34, 20, 6, 1.5, 1.5, "F");
    doc.setFontSize(7); doc.setFont(undefined, "bold"); doc.setTextColor(255, 255, 255);
    doc.text("FINAL", 210 - M - 10, 38.5, { align: "center" });
  }

  doc.setTextColor(0, 0, 0);
  let y = 52;

  // ── Thin gold rule under header ───────────────────────────────────────────
  doc.setDrawColor(...gold); doc.setLineWidth(0.7);
  doc.line(M, y - 2, M + pw, y - 2);

  // ── PARTY TABLE ───────────────────────────────────────────────────────────
  const buyerAddr  = contract.buyer_address  || buyer?.address     || "";
  const hasConsignee = !!(contract.consignee_id && contract.consignee_name);
  const consigneeAddr = contract.consignee_address || consignee?.address || "";

  // Build rows — 3 columns: label | name (bold) | address+clause
  const partyRows = [
    [
      { content: "SELLER", styles: { fontStyle: "bold", halign: "center", valign: "middle", fillColor: navy, textColor: white, fontSize: 8 } },
      { content: COMPANY.name, styles: { fontStyle: "bold", textColor: navy, fillColor: cream, fontSize: 8.5 } },
      { content: COMPANY.address + "\n(Hereinafter referred to as \"the Seller\")", styles: { fontSize: 7.8, fillColor: cream, textColor: [50, 50, 50] } },
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
    tableLineColor: gold, tableLineWidth: 0.5,
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
  const qtyDisplay = (contract.quantity_mt || "") + " MTS " +
    (contract.quantity_tolerance || "+/- 5% at seller's option") +
    (contract.container_qty && contract.container_type
      ? "\n" + contract.container_qty + " x " + contract.container_type : "");

  const baseTerms = (contract.delivery_terms || "CIF").split(" ")[0];
  const priceDisplay = "USD " + (contract.price_usd || "") + " Per " + (contract.price_per || "MTs") + " " + (contract.delivery_terms || "CIF");

  const selectedDocs = Array.isArray(contract.selected_docs) ? contract.selected_docs : [];
  const docsText = ALL_DOCS.filter(d => selectedDocs.includes(d.key)).map(d => {
    if (d.key === "other_document") {
      return contract.other_doc_name ? contract.other_doc_name : "Other Document";
    }
    return d.label;
  }).join("\n");

  const termRows = [
    [{ content: "Commodity",       styles: { fontStyle: "bold", fillColor: lgray, textColor: navy } }, { content: contract.commodity || "", styles: { fontStyle: "bold", textColor: [20, 80, 20] } }],
    [{ content: "Quantity",        styles: { fontStyle: "bold", fillColor: lgray, textColor: navy } }, { content: qtyDisplay }],
    [{ content: "Loading Port",    styles: { fontStyle: "bold", fillColor: lgray, textColor: navy } }, { content: contract.loading_port || "" }],
    [{ content: "Destination",     styles: { fontStyle: "bold", fillColor: lgray, textColor: navy } }, { content: contract.destination || "" }],
    [{ content: "Specification",   styles: { fontStyle: "bold", fillColor: lgray, textColor: navy } }, { content: contract.specification || "" }],
    [{ content: "Shipment",        styles: { fontStyle: "bold", fillColor: lgray, textColor: navy } }, { content: contract.shipment_period || "" }],
    [{ content: "Packing",         styles: { fontStyle: "bold", fillColor: lgray, textColor: navy } }, { content: contract.packing || "" }],
    [{ content: "Price",           styles: { fontStyle: "bold", fillColor: lgray, textColor: navy  } }, { content: priceDisplay, styles: { fontStyle: "bold", textColor: [20, 80, 20] } }],
    [{ content: "Payment Terms",   styles: { fontStyle: "bold", fillColor: lgray, textColor: navy } }, { content: contract.payment_condition || "", styles: { fontStyle: "bold" } }],
    [{ content: "Documents\nRequired", styles: { fontStyle: "bold", fillColor: lgray, textColor: navy } }, { content: docsText }],
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
    if (y > 255) { doc.addPage(); addPageDecor(); y = 24; }
    doc.setFillColor(...lgray); doc.setDrawColor(...gold); doc.setLineWidth(0.5);
    const scLines = doc.splitTextToSize(contract.special_conditions, pw - 10);
    const boxH = 10 + scLines.length * 4.8;
    doc.roundedRect(M, y, pw, boxH, 2, 2, "FD");
    doc.setFontSize(8.5); doc.setFont(undefined, "bold"); doc.setTextColor(...navy);
    doc.text("Special Conditions:", M + 5, y + 5.5);
    y += 10;
    doc.setFont(undefined, "normal"); doc.setTextColor(40, 40, 40); doc.setFontSize(8.2);
    scLines.forEach(line => { doc.text(line, M + 5, y); y += 4.8; });
    y += 4;
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

  drawSigBox(M, "SELLER", COMPANY.name);
  drawSigBox(M + sigW + 8, "BUYER", contract.buyer_name || "");

  // ── FOOTER on every page ──────────────────────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFillColor(...gold); doc.rect(0, 0, 210, 2.5, "F");
    doc.setFillColor(...navy); doc.rect(0, 290, 210, 7, "F");
    doc.setFontSize(6.5); doc.setTextColor(...white); doc.setFont(undefined, "normal");
    doc.text(COMPANY.name + "  |  +91-9111282828  |  akshay@devratan.com  |  www.devratan.com  |  GSTIN: 23AARFD8883D1Z3  |  IEC: AARFD8883D", 105, 293.5, { align: "center" });
    // Gold page number pill
    doc.setFillColor(...gold); doc.roundedRect(M + pw - 16, 283.5, 16, 6, 1.5, 1.5, "F");
    doc.setFontSize(7); doc.setFont(undefined, "bold"); doc.setTextColor(...navy);
    doc.text(i + " / " + totalPages, M + pw - 8, 287.5, { align: "center" });
  }

  doc.save("Contract_" + (contract.contract_no || "draft") + ".pdf");
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
  const [profits,setProfits]=useState([]);
  const [users,setUsers]=useState([]);
  const [buyers,setBuyers]=useState([]);
  const [contracts,setContracts]=useState([]);
  const [pendings,setPendings]=useState([]);
  const [showApprovals,setShowApprovals]=useState(false);
  const [showBuyerForm,setShowBuyerForm]=useState(false);
  const [editBuyer,setEditBuyer]=useState(null);
  const [showContractForm,setShowContractForm]=useState(false);
  const [editContract,setEditContract]=useState(null);
  const [buyerSearch,setBuyerSearch]=useState("");
  const [contractSearch,setContractSearch]=useState("");
  const [shipDocsId,setShipDocsId]=useState(null);
  const [bcDocsId,setBCDocsId]=useState(null);
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
    try{
      const[s,b,p,u,pc,by,ct]=await Promise.all([
        sb("shipments?select=*&order=invoice_date.desc"),
        sb("bill_collections?select=*,irm_entries(*),brc_entries(*)"),
        sb("profitability?select=*&order=created_at.desc"),
        sb("users?select=*&order=name.asc"),
        sb("pending_changes?select=*&order=submitted_at.desc"),
        sb("buyers?select=*&order=buyer_name.asc"),
        sb("contracts?select=*&order=created_at.desc"),
      ]);
      setShips(s||[]);setBcs(b||[]);setProfits(p||[]);setUsers(u||[]);setPendings(pc||[]);setBuyers(by||[]);setContracts(ct||[]);
    }catch(e){console.error(e);}
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

  const filtered=useMemo(()=>{
    let s=[...fyShips];
    // Dashboard quick filters
    if(dashFilter==="brc") s=s.filter(x=>{const bc=getBC(x);return !bc||bc.brc_entries?.every(b=>!b.brc_no);});
    if(dashFilter==="rodtep") s=s.filter(x=>x.rodtep_status==="Pending");
    if(dashFilter==="gst") s=s.filter(x=>x.gst_status==="Pending");
    if(search) s=s.filter(x=>Object.values(x).join(" ").toLowerCase().includes(search.toLowerCase()));
    s.sort((a,b)=>{let av=a[sortCol],bv=b[sortCol];if(!isNaN(Number(av))){av=Number(av);bv=Number(bv);}return av<bv?(sortDir==="asc"?-1:1):av>bv?(sortDir==="asc"?1:-1):0;});
    return s;
  },[fyShips,search,sortCol,sortDir,dashFilter,bcs]);

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
      // Convert empty strings to null for numeric fields
      ["price_usd","quantity_mt","container_qty"].forEach(k=>{
        if(payload[k]===""||payload[k]===undefined) payload[k]=null;
        else payload[k]=Number(payload[k])||null;
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
    const bc=getBC(s),c=calcShip(s);
    setProfitForm(f=>({...f,invoice_no:inv,invoice_date:s.invoice_date,buyer_name:s.buyer_name,port_of_discharge:s.port_of_discharge,invoice_amt_inr:c.invoiceAmtINR,payment_received_inr:bc?bc.total_amt_inr:0,qty_mt:s.qty}));
  };

  const saveProfit=async()=>{
    if(!profitForm.invoice_no){alert("Invoice No required.");return;}
    setSaving(true);
    try{
      const payload={...profitForm};delete payload.id;delete payload.created_at;
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
        await sb(`bill_collections?id=eq.${bc.id}`,{method:"PATCH",body:JSON.stringify({bank_name:bcData.bank_name,bc_no:bcData.bc_no,bc_date:bcData.bc_date,linked_invoices:bcData.linked_invoices,total_amt_usd:bcData.total_amt_usd,total_amt_inr:bcData.total_amt_inr})});
        await sb(`irm_entries?bc_id=eq.${bc.id}`,{method:"DELETE"});
        await sb(`brc_entries?bc_id=eq.${bc.id}`,{method:"DELETE"});
      }else{
        const res=await sb("bill_collections",{method:"POST",body:JSON.stringify({bank_name:bcData.bank_name,bc_no:bcData.bc_no,bc_date:bcData.bc_date,linked_invoices:bcData.linked_invoices,total_amt_usd:bcData.total_amt_usd,total_amt_inr:bcData.total_amt_inr})});
        bcId=res[0]?.id;
      }
      if(irm_entries?.length){await sb("irm_entries",{method:"POST",body:JSON.stringify(irm_entries.map(i=>({bc_id:bcId,irm_no:i.irmNo||i.irm_no||"",irm_date:i.irmDate||i.irm_date||null,irm_amt_usd:n(i.irmAmtUSD||i.irm_amt_usd),exchange_rate:n(i.exchangeRate||i.exchange_rate),irm_amt_inr:n(i.irmAmtINR||i.irm_amt_inr),intermediary_charges_usd:n(i.intermediaryChargesUSD||i.intermediary_charges_usd||0)})))});}
      if(brc_entries?.length){await sb("brc_entries",{method:"POST",body:JSON.stringify(brc_entries.map(b=>({bc_id:bcId,brc_no:b.brcNo||b.brc_no||"",brc_date:b.brcDate||b.brc_date||null,brc_amt_usd:n(b.brcAmtUSD||b.brc_amt_usd)})))});}
      await loadAll();setShowBC(false);setEditBC(null);
    }catch(e){alert("Error saving BC: "+e.message);}
    setSaving(false);
  };

  const profitCalc=useMemo(()=>{try{return calcProfit(profitForm);}catch{return{interest:0,bankCh:0,localBrokerage:0,totalFOB:0,totalDirect:0,totalCIF:0,profit:0};}},[profitForm]);
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
  function Th({col,label,right}){return<th onClick={()=>doSort(col)} style={{padding:"9px 10px",textAlign:right?"right":"left",color:"#64748b",fontWeight:600,fontSize:11.5,borderBottom:"2px solid #e2e8f0",cursor:"pointer",whiteSpace:"nowrap",userSelect:"none",background:"#f8fafc",overflow:"hidden",textOverflow:"ellipsis"}}>{label}{sortCol===col?(sortDir==="asc"?" ↑":" ↓"):""}</th>;}

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
          ...(!isJuniorAccountant?[["profitability","💰 P&L"],["bcmanager","🏦 Bill Coll."]]:[]),
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
            <div style={{marginBottom:10}}><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search..." style={{...iS,fontSize:13}}/></div>
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
                    <th onClick={()=>doSort("invoice_no")} style={{padding:"9px 10px",textAlign:"left",color:"#64748b",fontWeight:600,fontSize:11.5,borderBottom:"1px solid #e2e8f0",cursor:"pointer",whiteSpace:"nowrap",userSelect:"none",background:"#f0f4ff",position:"sticky",left:0,zIndex:11,minWidth:130,boxShadow:"2px 0 4px rgba(0,0,0,0.08)"}}>Invoice No{sortCol==="invoice_no"?(sortDir==="asc"?" ↑":" ↓"):""}</th><Th col="invoice_date" label="Date"/><Th col="buyer_name" label="Buyer"/><Th col="buyer_country" label="Country"/><Th col="product" label="Product"/><Th col="port_of_loading" label="Port Load"/><Th col="port_of_discharge" label="Port Disch"/><Th col="shipping_bill_no" label="SB No"/><Th col="shipping_bill_date" label="SB Date"/><Th col="port_code" label="Port Code"/><Th col="bl_no" label="BL No"/><Th col="bl_date" label="BL Date"/><Th col="qty" label="Qty(MT)" right/><Th col="rate_per_mt" label="Rate/MT" right/><Th col="delivery_terms" label="Terms"/><Th col="i1" label="Inv(USD)" right/><Th col="exchange_rate" label="ExRate" right/><Th col="i2" label="Inv(INR)" right/><Th col="igst" label="IGST" right/><Th col="i3" label="Gross(INR)" right/><Th col="fob_value_usd" label="FOB(USD)" right/><Th col="i4" label="FOB(INR)" right/><Th col="rodtep_amount" label="RODTEP(INR)" right/><Th col="rodtep_status" label="RODTEP"/><Th col="gst_status" label="GST"/><Th col="bc_no" label="BC No"/><Th col="bc_bank" label="BC Bank"/><Th col="bc_date" label="BC Date"/><Th col="brc_nos" label="BRC No(s)"/><Th col="brc_dates" label="BRC Dates"/><Th col="paid_usd" label="Pmt(USD)" right/><Th col="paid_inr" label="Pmt(INR)" right/><Th col="bal" label="Balance(USD)" right/>
                    {canEdit&&<th style={{padding:"9px 10px",color:"#64748b",fontWeight:600,fontSize:11.5,borderBottom:"1px solid #e2e8f0",background:"#f8fafc",whiteSpace:"nowrap"}}>Actions</th>}
                  </tr></thead>
                  <tbody>
                    {filtered.map(s=>{const c=calcShip(s),bc=getBC(s),bal=c.invoiceAmtUSD-(bc?bc.total_amt_usd:0),brcNos=bc?bc.brc_entries?.map(b=>b.brc_no).filter(Boolean).join(", "):"—",brcDts=bc?bc.brc_entries?.map(b=>b.brc_date).filter(Boolean).join(", "):"—";return(
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
                        <td style={{padding:"7px 10px",textAlign:"right",color:"#16a34a",fontWeight:600}}>{bc?fU(bc.total_amt_usd):"—"}</td>
                        <td style={{padding:"7px 10px",textAlign:"right",color:"#15803d",fontWeight:600}}>{bc?fR(bc.total_amt_inr):"—"}</td>
                        <td style={{padding:"7px 10px",textAlign:"right",fontWeight:700,color:bal>0?"#dc2626":"#16a34a"}}>{fU(bal)}</td>
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
            <ProfitabilityContent fy={fy} fyProfits={fyProfits} canEdit={canEditPL} canDelete={canDelete} openAddProfit={openAddProfit} openEditProfit={openEditProfit} onDelete={deleteProfit}/>
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

        {tab==="bcmanager"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10,marginBottom:14}}>
              <div><h2 style={{margin:"0 0 2px",color:"#1e3a5f",fontSize:17}}>Bill Collections</h2><p style={{margin:0,fontSize:11,color:"#64748b"}}>{bcs.length} total</p></div>
              <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                <button onClick={()=>setExportModal("bc")} style={{background:"#15803d",color:"#fff",border:"none",borderRadius:7,padding:"6px 12px",cursor:"pointer",fontWeight:600,fontSize:11}}>📤 Export</button>
                {canEditBC&&<button onClick={()=>{setEditBC(null);setShowBC(true);}} style={{background:"linear-gradient(135deg,#1e3a5f,#16a34a)",color:"#fff",border:"none",borderRadius:8,padding:"6px 12px",cursor:"pointer",fontWeight:600,fontSize:12}}>+ New BC</button>}
              </div>
            </div>
            {bcs.length===0&&<div style={{background:"#fff",borderRadius:12,padding:30,textAlign:"center",color:"#94a3b8",fontSize:13}}>No bill collections yet.</div>}
            <div style={{display:"grid",gap:10}}>
              {bcs.map(bc=>(
                <div key={bc.id} style={{background:"#fff",borderRadius:12,padding:14,boxShadow:"0 1px 4px rgba(0,0,0,0.07)"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8,marginBottom:10}}>
                    <div><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}><span style={{fontWeight:700,color:"#1e3a5f",fontSize:14}}>{bc.bc_no}</span><Badge val={bc.bank_name} map={{SBI:{bg:"#dcfce7",color:"#16a34a"},INDUSIND:{bg:"#dbeafe",color:"#1d4ed8"}}}/></div><div style={{fontSize:11,color:"#64748b"}}>Date: {bc.bc_date} · Linked: {bc.linked_invoices?.join(", ")||"None"}</div></div>
                    <div style={{display:"flex",gap:6,alignItems:"center"}}>
                      <div style={{textAlign:"right"}}><div style={{fontSize:15,fontWeight:700,color:"#16a34a"}}>{fU(bc.total_amt_usd)}</div><div style={{fontSize:11,color:"#15803d"}}>{fR(bc.total_amt_inr)}</div></div>
                      <button onClick={()=>exportBCPDF(bc)} style={{background:"#eff6ff",color:"#0369a1",border:"none",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:600}}>📄 PDF</button>
                      <button onClick={()=>setBCDocsId(bc.id)} style={{background:"#f0fdf4",color:"#16a34a",border:"none",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:600}}>📁 Docs</button>
                      {canEdit&&<button onClick={()=>{setEditBC(bc);setShowBC(true);}} style={{background:"#dbeafe",color:"#1d4ed8",border:"none",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:600}}>Edit</button>}
                      {canDelete&&<button onClick={async()=>{if(!window.confirm(`Delete BC ${bc.bc_no}?`))return;try{await sb(`brc_entries?bc_id=eq.${bc.id}`,{method:"DELETE"});await sb(`irm_entries?bc_id=eq.${bc.id}`,{method:"DELETE"});await sb(`bill_collections?id=eq.${bc.id}`,{method:"DELETE"});await loadAll();}catch(e){alert("Error: "+e.message);}}} style={{background:"#fee2e2",color:"#dc2626",border:"none",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:600}}>Delete</button>}
                    </div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    <div><div style={{fontSize:10,fontWeight:700,color:"#64748b",marginBottom:4}}>IRM ENTRIES</div>{bc.irm_entries?.map((irm,i)=><div key={irm.id} style={{background:"#f8fafc",borderRadius:6,padding:"6px 8px",marginBottom:3,fontSize:11}}><div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontWeight:600}}>#{i+1} {irm.irm_no}</span><span style={{color:"#16a34a",fontWeight:600}}>{fU(irm.irm_amt_usd)}</span></div><div style={{color:"#64748b"}}>{irm.irm_date} · {fR(irm.irm_amt_inr)}</div></div>)}</div>
                    <div><div style={{fontSize:10,fontWeight:700,color:"#64748b",marginBottom:4}}>BRC ENTRIES</div>{bc.brc_entries?.map((brc,i)=><div key={brc.id} style={{background:"#f8fafc",borderRadius:6,padding:"6px 8px",marginBottom:3,fontSize:11}}><div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontWeight:600}}>#{i+1} {brc.brc_no||"—"}</span><span style={{color:"#0369a1",fontWeight:600}}>{fU(brc.brc_amt_usd)}</span></div><div style={{color:"#64748b"}}>Date: {brc.brc_date||"—"}</div></div>)}</div>
                  </div>
                </div>
              ))}
            </div>
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
                          {canManageContracts&&<button onClick={()=>{setEditContract(c);setShowContractForm(true);}} style={{background:"rgba(255,255,255,0.15)",color:"#fff",border:"none",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:600}}>Edit</button>}
                          {canDeleteContracts&&<button onClick={()=>deleteContract(c.id)} style={{background:"rgba(220,38,38,0.3)",color:"#fca5a5",border:"none",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:11}}>Del</button>}
                        </div>
                      </div>
                      <div style={{padding:"12px 16px"}}>
                        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:8,fontSize:12}}>
                          <div><span style={{color:"#94a3b8",fontSize:11}}>Commodity</span><div style={{fontWeight:600,color:"#1e293b"}}>{c.commodity}</div></div>
                          <div><span style={{color:"#94a3b8",fontSize:11}}>Quantity</span><div style={{fontWeight:600,color:"#1e293b"}}>{c.quantity}</div></div>
                          <div><span style={{color:"#94a3b8",fontSize:11}}>Price</span><div style={{fontWeight:700,color:"#1e3a5f"}}>USD {c.price_usd} / {c.price_per} {c.delivery_terms}</div></div>
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
            <h3 style={{margin:"0 0 4px",color:"#1e3a5f",fontSize:14}}>{editShipId?"Edit":"Add"} Shipment</h3>
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
            <SH t="Bill Collection"/>
            <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:8,alignItems:"end",marginBottom:8}}>
              <div><label style={{fontSize:11,fontWeight:600,color:"#374151",display:"block",marginBottom:2}}>Bill Collection No</label><select value={shipForm.bc_id||""} onChange={e=>setSF("bc_id",e.target.value?Number(e.target.value):null)} style={iS}><option value="">Not linked</option>{bcs.map(b=><option key={b.id} value={b.id}>{b.bc_no} ({b.bank_name}) — {fU(b.total_amt_usd)}</option>)}</select></div>
              {canEditBC&&<button onClick={()=>setShowBC(true)} style={{background:"#eff6ff",color:"#1d4ed8",border:"1px solid #bfdbfe",borderRadius:7,padding:"7px 10px",cursor:"pointer",fontSize:11,fontWeight:600,whiteSpace:"nowrap"}}>+ New</button>}
            </div>
            {selectedBC&&<div style={{background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:7,padding:8,fontSize:11,marginBottom:10}}><b style={{color:"#15803d"}}>{selectedBC.bc_no}</b> · {fU(selectedBC.total_amt_usd)}</div>}
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
      {showBC&&<BCModal bc={editBC} allShips={ships} onSave={saveBC} onClose={()=>{setShowBC(false);setEditBC(null);}} saving={saving}/>}
      {viewShipId&&<DetailModal shipment={viewShip} bc={viewShip?getBC(viewShip):null} onClose={()=>setViewShipId(null)} onViewDocs={()=>setShipDocsId(viewShipId)}/>}
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
      {showApprovals&&<ApprovalsModal pendings={pendings} userInfo={userInfo} onClose={()=>setShowApprovals(false)} onRefresh={loadAll} ships={ships}/>}

      {showBuyerForm&&<BuyerFormModal buyer={editBuyer} onSave={saveBuyer} onClose={()=>{setShowBuyerForm(false);setEditBuyer(null);}} saving={saving}/>}
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
