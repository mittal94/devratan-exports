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
const DEL_TERMS = ["CIF","FOB"];
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
                    <div style={{fontSize:12,color:"#dc2626",fontWeight:600}}>⚠️ Request to delete shipment: {pc.old_data?.invoice_no} — {pc.old_data?.buyer_name}</div>
                  ):(
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:6,fontSize:11}}>
                      {[["Product",data.product],["Qty (MT)",data.qty],["Rate/MT",data.rate_per_mt],["Terms",data.delivery_terms],["Country",data.buyer_country],["Port Load",data.port_of_loading]].map(([l,v])=>v?<div key={l}><span style={{color:"#64748b"}}>{l}: </span><b style={{color:"#1e293b"}}>{v}</b></div>:null)}
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
  const [pendings,setPendings]=useState([]);
  const [showApprovals,setShowApprovals]=useState(false);
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
  const [exportModal,setExportModal]=useState(null); // "shipments"|"profitability"|"bc"|"dashboard"
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
      const[s,b,p,u,pc]=await Promise.all([
        sb("shipments?select=*&order=invoice_date.desc"),
        sb("bill_collections?select=*,irm_entries(*),brc_entries(*)"),
        sb("profitability?select=*&order=created_at.desc"),
        sb("users?select=*&order=name.asc"),
        sb("pending_changes?select=*&order=submitted_at.desc"),
      ]);
      setShips(s||[]);setBcs(b||[]);setProfits(p||[]);setUsers(u||[]);setPendings(pc||[]);
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

  // ── Force logout on new app version deployment ───────────────────────────
  // Handled in useState initializer above — session is null if version changed
  useEffect(()=>{
    const storedVer=localStorage.getItem("app_version");
    if(storedVer && storedVer!==APP_VERSION){
      // Fallback: if somehow still logged in, show message
      alert("App has been updated. Please log in again.");
    }
  },[]);

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

      <div style={{background:"#fff",borderBottom:"1px solid #e2e8f0",display:"flex",overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
        {[["dashboard","📊 Dashboard"],["shipments","📦 Register"],
          ...(!isJuniorAccountant?[["profitability","💰 P&L"],["bcmanager","🏦 Bill Coll."]]:[])
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
