
/* ============================================================
   STORAGE ADAPTER
   Prototype uses the artifact storage API (window.storage) so your
   progress actually persists across sessions.
   ---- TO HOST THIS YOURSELF ----
   Replace these three functions with localStorage:
     wsGet(k)  -> JSON.parse(localStorage.getItem(k))
     wsSet(k,v)-> localStorage.setItem(k, JSON.stringify(v))
   In the real PWA this layer is IndexedDB (see design doc §8).
   ============================================================ */
/* ============================================================
   STORAGE ADAPTER
   Tries real browser storage first (persists when hosted on GitHub
   Pages or opened normally), falls back to the artifact storage API
   (for the in-chat preview), then to memory. No setup needed.
   ============================================================ */
export const STORE = (function(){
  try{
    const k="__mr_test"; localStorage.setItem(k,"1"); localStorage.removeItem(k);
    return { kind:"local",
      async get(key){ const v=localStorage.getItem(key); return v?JSON.parse(v):null; },
      async set(key,val){ try{ localStorage.setItem(key, JSON.stringify(val)); }catch(e){} } };
  }catch(e){}
  if(typeof window!=="undefined" && window.storage && typeof window.storage.get==="function"){
    return { kind:"artifact",
      async get(key){ try{ const r=await window.storage.get(key); return r&&r.value?JSON.parse(r.value):null; }catch(e){ return null; } },
      async set(key,val){ try{ await window.storage.set(key, JSON.stringify(val)); }catch(e){} } };
  }
  const m={};
  return { kind:"memory", async get(key){ return m[key]!==undefined?m[key]:null; }, async set(key,val){ m[key]=val; } };
})();
export async function wsGet(k){ return STORE.get(k); }
export async function wsSet(k,v){ return STORE.set(k,v); }
export const SK = {progress:"medrecall:progress:v1", exams:"medrecall:exams:v1", settings:"medrecall:settings:v1", reports:"medrecall:reports:v1"};
export let DB = {
  progress:{ questions:{}, resume:null, streak:{current:0,lastStudied:null}, checklist:{}, timeLog:{}, timer:null },
  exams:[],
  reports:[],
  settings:{ newPerDay:20, passMark:50, maintainer:false, wallpaper:"ink", theme:"dark", dailyGoal:20, sounds:true, examDate:"", revealOnPick:true, notif:{ enabled:false, daily:true, due:true, streak:true, exam:true, time:"19:00", lastFired:{} } }
};
export async function loadDB(){
  const p = await wsGet(SK.progress); if(p) DB.progress = Object.assign(DB.progress, p);
  const e = await wsGet(SK.exams);    if(e) DB.exams = e;
  const r = await wsGet(SK.reports);  if(r) DB.reports = r;
  const s = await wsGet(SK.settings); if(s) DB.settings = Object.assign(DB.settings, s);
}
export const save = {
  progress(){ wsSet(SK.progress, DB.progress); },
  exams(){ wsSet(SK.exams, DB.exams); },
  reports(){ wsSet(SK.reports, DB.reports); },
  settings(){ wsSet(SK.settings, DB.settings); }
};

/* ============================================================
   SM-2 SPACED REPETITION  (Anki-family; design doc §3)
   ============================================================ */
export function schedule(srs, grade){
  let s = srs ? {...srs} : {ease:2.5, interval:0, reps:0, lapses:0};
  const q = {again:2, hard:3, good:4, easy:5}[grade];
  if(grade==="again"){
    s.reps=0; s.interval=1; s.lapses+=1; s.ease=Math.max(1.3, s.ease-0.2);
  } else {
    s.reps+=1;
    if(s.reps===1) s.interval = grade==="easy"?2:1;
    else if(s.reps===2) s.interval = grade==="hard"?4:6;
    else s.interval = Math.max(1, Math.round(s.interval * s.ease * (grade==="hard"?0.8:1) * (grade==="easy"?1.3:1)));
    s.ease = Math.max(1.3, s.ease + (0.1 - (5-q)*(0.08 + (5-q)*0.02)));
  }
  s.ease = +s.ease.toFixed(2);
  s.due = addDays(today(), s.interval);
  return s;
}

/* ============================================================
   DATE HELPERS
   ============================================================ */
export function today(){ const d=new Date(); return d.toISOString().slice(0,10); }
export function addDays(iso, n){ const d=new Date(iso+"T00:00:00"); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); }
export function yesterday(){ return addDays(today(),-1); }
export function fmtTime(sec){ sec=Math.max(0,Math.round(sec)); const m=Math.floor(sec/60), s=sec%60; return m+":"+String(s).padStart(2,"0"); }

/* ============================================================
   CONTENT BANK  (sample pack — the engine holds zero questions;
   in production these load as JSON from the GitHub manifest, §2)
   Clinical content checked against standard teaching.
   ============================================================ */
export const BANK = [
{ id:"OBGYN", title:"Obstetrics & Gynaecology", color:"#3fb6a8", questions:[
  { id:"obg1", topic:"Post-op complications", source:"End Block 2 · Univ of Kufa",
    stem:"A 34-year-old woman is <b>6 hours after a total abdominal hysterectomy</b>. She is restless, with <b>BP 80/50 mmHg</b>, <b>HR 124</b>, and a distended, tender abdomen. Urine output has fallen. What is the most likely cause?",
    choices:[
      {l:"A",t:"Paralytic ileus",correct:false,e:"Ileus causes distension, vomiting and absent bowel sounds — but the patient stays <b>haemodynamically stable</b>. It does not produce hypotension and tachycardia this early."},
      {l:"B",t:"Intra-abdominal haemorrhage",correct:true,e:"Hypotension + tachycardia hours after major pelvic surgery signals <b>concealed bleeding</b> (often a slipped pedicle ligature). Resuscitate and return to theatre."},
      {l:"C",t:"Lower urinary tract infection",correct:false,e:"A UTI gives dysuria/fever days later, not hour-1 shock."},
      {l:"D",t:"Basal atelectasis",correct:false,e:"Atelectasis causes low-grade fever and hypoxia in the first 24–48h, not circulatory collapse."},
      {l:"E",t:"Pulmonary embolism",correct:false,e:"PE can cause collapse but typically days post-op, with pleuritic pain/hypoxia rather than an acutely distended abdomen."}
    ],
    keyPoint:"Post-op hypotension + tachycardia = haemorrhage until proven otherwise. Resuscitate first, image/return to theatre second.",
    keyDiff:"<b>Haemorrhage</b> → unstable vitals (↓BP, ↑HR). <b>Ileus / AKI</b> → vitals normal, the problem is distension or oliguria.",
    sum:{headers:["Feature","Haemorrhage","Ileus"],rows:[["Onset","Hours","Days"],["Vitals","Unstable","Stable"],["Abdomen","Tense, distending","Distended, tympanic"],["Action","Theatre","Conservative"]]},
    refs:"Bailey & Love 27e" },
  { id:"obg2", topic:"PPH", source:"Formative IV · Univ of Kufa",
    stem:"Immediately after a vaginal delivery, a woman has <b>brisk bleeding</b>. The uterus is <b>soft and boggy</b> and rises above the umbilicus. What is the first-line management?",
    choices:[
      {l:"A",t:"IV oxytocin + uterine massage",correct:true,e:"Atony is the cause in ~70% of primary PPH. First-line is <b>uterotonics</b> (oxytocin) plus rubbing up a contraction."},
      {l:"B",t:"Emergency hysterectomy",correct:false,e:"A last resort only after medical + conservative surgical measures fail."},
      {l:"C",t:"Uterine artery embolisation",correct:false,e:"Useful in a stable patient when uterotonics fail and interventional radiology is available — not the first move."},
      {l:"D",t:"Tranexamic acid alone",correct:false,e:"TXA is a valuable adjunct and reduces death from bleeding, but does not replace uterotonics for atony."},
      {l:"E",t:"B-Lynch compression suture",correct:false,e:"A surgical step if medical management fails and you are already in theatre."}
    ],
    keyPoint:"Primary PPH: think the 4 Ts — Tone, Trauma, Tissue, Thrombin. Tone (atony) is commonest → uterotonics first.",
    keyDiff:"<b>Atony</b> → soft boggy uterus. <b>Trauma</b> → well-contracted uterus but ongoing bleeding (look for a tear).",
    sum:{headers:["The 4 Ts","Mechanism","First step"],rows:[["Tone","Uterine atony","Oxytocin + massage"],["Trauma","Tears/rupture","Repair"],["Tissue","Retained products","Evacuate"],["Thrombin","Coagulopathy","Correct clotting"]]},
    refs:"RCOG Green-top 52" },
  { id:"obg3", topic:"Hypertensive disease", source:"Block 1 Summative · Univ of Kufa",
    stem:"A 32-week pregnant woman has <b>BP 168/112</b>, 3+ proteinuria, a frontal headache and <b>brisk reflexes with clonus</b>. Which is most appropriate to <b>prevent eclamptic seizures</b>?",
    choices:[
      {l:"A",t:"IV magnesium sulfate",correct:true,e:"<b>MgSO₄</b> is the agent of choice for both prevention and treatment of eclamptic seizures (MAGPIE trial)."},
      {l:"B",t:"IV labetalol",correct:false,e:"Labetalol controls the blood pressure but does <b>not</b> prevent seizures — both are needed, but the question asks about seizure prophylaxis."},
      {l:"C",t:"IV diazepam",correct:false,e:"Benzodiazepines are inferior to magnesium for eclampsia and risk neonatal sedation."},
      {l:"D",t:"IV phenytoin",correct:false,e:"Less effective than magnesium for eclamptic seizures."},
      {l:"E",t:"Immediate caesarean section",correct:false,e:"Delivery is the definitive cure, but the mother must first be stabilised (BP control + MgSO₄)."}
    ],
    keyPoint:"Severe pre-eclampsia: control BP (labetalol/nifedipine) AND give MgSO₄ for seizure prophylaxis. Delivery is the cure.",
    keyDiff:"<b>MgSO₄</b> = seizures. <b>Labetalol/nifedipine</b> = blood pressure. Don't confuse the two roles.",
    sum:{headers:["Problem","Drug"],rows:[["Seizure prevention/treatment","Magnesium sulfate"],["Acute severe hypertension","Labetalol or nifedipine"],["Definitive treatment","Delivery"]]},
    refs:"NICE NG133; MAGPIE" },
  { id:"obg4", topic:"Preterm labour", source:"Block 5 Summative · Univ of Kufa",
    stem:"A woman at <b>30 weeks</b> is in established preterm labour. The fetus is well and there are <b>no contraindications</b> to tocolysis. Which agent is recommended first-line?",
    choices:[
      {l:"A",t:"Nifedipine",correct:true,e:"NICE recommends <b>nifedipine</b> first-line for tocolysis (effective, oral, cheap). Atosiban is the alternative if nifedipine is contraindicated."},
      {l:"B",t:"Atosiban",correct:false,e:"An oxytocin-receptor antagonist used when nifedipine is unsuitable — not the routine first choice in the NICE pathway."},
      {l:"C",t:"Ritodrine",correct:false,e:"A β-agonist, now largely abandoned because of maternal cardiovascular side-effects."},
      {l:"D",t:"Indomethacin",correct:false,e:"Effective but limited by fetal effects (ductal constriction, oligohydramnios), usually only <32 weeks short-term."},
      {l:"E",t:"Magnesium sulfate",correct:false,e:"Used for fetal neuroprotection <30 weeks, NOT as a tocolytic."}
    ],
    keyPoint:"Tocolysis buys ~48h for steroids/transfer. NICE first-line = nifedipine; atosiban if contraindicated.",
    keyDiff:"Tocolytic = delay delivery (nifedipine). MgSO₄ here = fetal neuroprotection, a different purpose.",
    sum:{headers:["Role","Agent"],rows:[["1st-line tocolytic","Nifedipine"],["Alternative tocolytic","Atosiban"],["Neuroprotection <30/40","Magnesium sulfate"],["Fetal lung maturity","Antenatal corticosteroids"]]},
    flag:{severity:"HIGH",app:"B — Atosiban",correct:"A — Nifedipine",source:"NICE NG25",note:"Some Q-banks mark Atosiban; NICE NG25 (2015) specifies nifedipine as first-line tocolytic."},
    refs:"NICE NG25" },
  { id:"obg5", topic:"Contraception", source:"Formative gp1 · Univ of Kufa",
    stem:"A 26-year-old with a history of <b>migraine with aura</b> requests contraception. Which method is <b>contraindicated</b>?",
    choices:[
      {l:"A",t:"Combined oral contraceptive pill",correct:true,e:"Migraine <b>with aura</b> is UKMEC category 4 for the COCP — the oestrogen raises ischaemic stroke risk. Absolutely avoid."},
      {l:"B",t:"Progestogen-only pill",correct:false,e:"POP is UKMEC 1 — safe, no oestrogen."},
      {l:"C",t:"Copper intrauterine device",correct:false,e:"Hormone-free, UKMEC 1 — entirely appropriate."},
      {l:"D",t:"Levonorgestrel IUS",correct:false,e:"Progestogen-only, locally acting — safe (UKMEC 1)."},
      {l:"E",t:"Progestogen implant",correct:false,e:"Oestrogen-free, safe in migraine with aura."}
    ],
    keyPoint:"Migraine WITH aura = no oestrogen. The COCP is UKMEC 4 (stroke risk). Progestogen-only and copper methods are fine.",
    keyDiff:"It's the <b>aura</b> that matters. Migraine without aura is UKMEC 2 (broadly usable); with aura it's category 4.",
    sum:{headers:["Method","Oestrogen?","Aura w/ migraine"],rows:[["COCP","Yes","Avoid (UKMEC 4)"],["POP / implant / IUS","No","Safe"],["Cu-IUD","No","Safe"]]},
    refs:"UKMEC 2016" }
]},
{ id:"PSYCH", title:"Psychiatry", color:"#7e9fd1", questions:[
  { id:"psy1", topic:"Delusional syndromes", source:"End Block · Univ of Kufa",
    stem:"A 58-year-old man with severe depression insists that <b>his bowels have rotted away</b> and that <b>he is already dead</b>. He has stopped eating. Which delusion is this?",
    choices:[
      {l:"A",t:"Capgras delusion",correct:false,e:"Capgras = belief a familiar person has been replaced by an identical impostor."},
      {l:"B",t:"Cotard delusion",correct:true,e:"<b>Cotard</b> = nihilistic delusion of being dead, not existing, or having rotting/absent organs. Classically seen in severe (psychotic) depression."},
      {l:"C",t:"Fregoli delusion",correct:false,e:"Fregoli = belief that different people are in fact one persecutor in disguise."},
      {l:"D",t:"Othello syndrome",correct:false,e:"Othello = delusional jealousy (belief partner is unfaithful)."},
      {l:"E",t:"Ekbom syndrome",correct:false,e:"Ekbom = delusional infestation (belief of being infested with parasites)."}
    ],
    keyPoint:"Cotard = 'I am dead / my organs have rotted.' A nihilistic delusion, red flag for severe psychotic depression and high suicide risk.",
    keyDiff:"<b>Cotard</b> (I am dead) vs <b>Capgras</b> (impostor) vs <b>Fregoli</b> (one disguised persecutor).",
    sum:{headers:["Syndrome","Core belief"],rows:[["Cotard","I am dead / not existing"],["Capgras","Loved one replaced by impostor"],["Fregoli","Strangers are one persecutor in disguise"],["Othello","Partner is unfaithful"],["Ekbom","Infested with parasites"]]},
    refs:"Oxford Handbook of Psychiatry" },
  { id:"psy2", topic:"Drug side-effects", source:"Formative IV · Univ of Kufa",
    stem:"Hours after his first dose of <b>haloperidol</b>, a young man develops a <b>sustained upward gaze and a twisted, rigid neck</b>. He is distressed but alert. What is the immediate treatment?",
    choices:[
      {l:"A",t:"IM procyclidine",correct:true,e:"This is <b>acute dystonia</b> (oculogyric crisis + torticollis). An <b>anticholinergic</b> (procyclidine/benztropine) reverses it rapidly."},
      {l:"B",t:"Oral propranolol",correct:false,e:"Propranolol treats akathisia, not acute dystonia."},
      {l:"C",t:"IV dantrolene",correct:false,e:"Dantrolene is for neuroleptic malignant syndrome (hyperthermia + lead-pipe rigidity), not isolated dystonia."},
      {l:"D",t:"Stop the drug and observe",correct:false,e:"Stopping helps eventually, but the patient is distressed — give an anticholinergic now."},
      {l:"E",t:"Increase the haloperidol dose",correct:false,e:"Dangerous — would worsen the extrapyramidal reaction."}
    ],
    keyPoint:"Acute dystonia (early, dramatic, oculogyric crisis/torticollis) → IM anticholinergic (procyclidine) for rapid relief.",
    keyDiff:"<b>Dystonia</b> (hours, anticholinergic) vs <b>akathisia</b> (propranolol) vs <b>NMS</b> (dantrolene, emergency).",
    sum:{headers:["EPSE","Timing","Treatment"],rows:[["Acute dystonia","Hours","Anticholinergic"],["Akathisia","Days–weeks","Propranolol"],["Parkinsonism","Weeks","Reduce dose / anticholinergic"],["Tardive dyskinesia","Months–years","Review antipsychotic"]]},
    refs:"Maudsley Prescribing Guidelines" },
  { id:"psy3", topic:"Emergencies", source:"End Block 2 · Univ of Kufa",
    stem:"A patient on an SSRI is also taking tramadol. He becomes agitated and febrile with <b>hyperreflexia, clonus and tremor</b>. Which is the diagnosis?",
    choices:[
      {l:"A",t:"Serotonin syndrome",correct:true,e:"Serotonergic drug combination + the triad of <b>neuromuscular excitation (clonus, hyperreflexia)</b>, autonomic instability and altered mental state = serotonin syndrome. Onset is rapid (hours)."},
      {l:"B",t:"Neuroleptic malignant syndrome",correct:false,e:"NMS follows dopamine blockers and is <b>hypokinetic</b> — lead-pipe rigidity, hyporeflexia, bradykinesia — evolving over days."},
      {l:"C",t:"Anticholinergic toxicity",correct:false,e:"Gives dry skin, urinary retention and absent bowel sounds — not clonus/hyperreflexia."},
      {l:"D",t:"Malignant hyperthermia",correct:false,e:"Triggered by volatile anaesthetics/suxamethonium, not SSRIs."},
      {l:"E",t:"Lithium toxicity",correct:false,e:"Coarse tremor, ataxia and confusion — not the hyper-reflexic clonus picture, and no lithium here."}
    ],
    keyPoint:"Serotonin syndrome is HYPERkinetic (clonus, hyperreflexia, rapid onset). NMS is HYPOkinetic (rigidity, hyporeflexia, slow onset).",
    keyDiff:"<b>Clonus + hyperreflexia</b> → serotonin syndrome. <b>Lead-pipe rigidity + hyporeflexia</b> → NMS.",
    sum:{headers:["Feature","Serotonin syndrome","NMS"],rows:[["Trigger","Serotonergics","Dopamine blockers"],["Onset","Hours","Days"],["Tone","Clonus, hyperreflexia","Lead-pipe rigidity"],["Reflexes","Increased","Decreased"]]},
    refs:"UpToDate" },
  { id:"psy4", topic:"Risk assessment", source:"Formative gp1 · Univ of Kufa",
    stem:"Which factor most strongly increases the risk of <b>completed suicide</b> following an act of deliberate self-harm?",
    choices:[
      {l:"A",t:"Detailed planning with precautions against discovery",correct:true,e:"High suicidal <b>intent</b> — planning, a final act (e.g. a note/will), and steps to avoid being found — is the strongest predictor of a completed suicide."},
      {l:"B",t:"Frequent superficial cutting",correct:false,e:"Repeated low-lethality self-harm signals distress but is not the strongest predictor of completion."},
      {l:"C",t:"Impulsive act after an argument",correct:false,e:"Impulsivity carries risk, but planned, concealed attempts with high intent carry more."},
      {l:"D",t:"Female sex",correct:false,e:"Women attempt more often; <b>men</b> have higher completion rates."},
      {l:"E",t:"Living with family",correct:false,e:"Social support is generally protective."}
    ],
    keyPoint:"It's the INTENT that predicts risk: planning, precautions against discovery, a final act, and ongoing wish to die.",
    keyDiff:"Frequency of self-harm ≠ lethality. A single highly-planned, concealed attempt outweighs repeated superficial acts.",
    sum:{headers:["Higher risk","Lower risk"],rows:[["Planned, concealed attempt","Impulsive, witnessed"],["Older male, isolated","Younger, supported"],["Ongoing wish to die","Relief at survival"],["Violent/lethal method","Low-lethality method"]]},
    refs:"NICE CG133" }
]},
{ id:"DERM", title:"Dermatology", color:"#d99a6c", questions:[
  { id:"der1", topic:"Papulosquamous", source:"End Block · Univ of Kufa",
    stem:"A 28-year-old has <b>well-demarcated erythematous plaques with silvery scale</b> on the <b>elbows and knees</b>, plus nail pitting. Scratching the scale leaves pinpoint bleeding. What is the diagnosis?",
    choices:[
      {l:"A",t:"Psoriasis",correct:true,e:"Classic chronic plaque <b>psoriasis</b>: extensor distribution, silvery scale, nail pitting, and the <b>Auspitz sign</b> (pinpoint bleeding on scale removal)."},
      {l:"B",t:"Atopic eczema",correct:false,e:"Eczema favours <b>flexures</b>, is itchy and ill-defined, with weeping/lichenification rather than silvery scale."},
      {l:"C",t:"Lichen planus",correct:false,e:"LP = the 6 Ps (purple, polygonal, pruritic, planar papules) with Wickham's striae, typically on flexor wrists."},
      {l:"D",t:"Pityriasis rosea",correct:false,e:"Herald patch then a 'fir-tree' truncal eruption that self-resolves — no silvery extensor plaques."},
      {l:"E",t:"Tinea corporis",correct:false,e:"An annular plaque with central clearing and a scaly advancing edge; KOH shows hyphae."}
    ],
    keyPoint:"Psoriasis = extensor surfaces + silvery scale + nail changes + Auspitz sign. Eczema is the flexural, itchy mirror image.",
    keyDiff:"<b>Psoriasis</b> → extensor, silvery, well-defined. <b>Eczema</b> → flexural, itchy, ill-defined.",
    sum:{headers:["Feature","Psoriasis","Eczema"],rows:[["Site","Extensor","Flexural"],["Scale","Silvery","Crusted/weepy"],["Border","Well-defined","Ill-defined"],["Nails","Pitting","Usually normal"]]},
    refs:"Davidson's Principles & Practice" },
  { id:"der2", topic:"Blistering disease", source:"Formative IV · Univ of Kufa",
    stem:"A 50-year-old has <b>flaccid blisters</b> that rupture into painful erosions, with significant <b>oral mucosal involvement</b>. Lateral pressure on normal skin shears the epidermis (<b>Nikolsky positive</b>). Which is the diagnosis?",
    choices:[
      {l:"A",t:"Pemphigus vulgaris",correct:true,e:"<b>Intra-epidermal</b> split (desmoglein antibodies) → flaccid blisters, prominent oral lesions, Nikolsky positive. Potentially fatal — needs systemic immunosuppression."},
      {l:"B",t:"Bullous pemphigoid",correct:false,e:"<b>Sub-epidermal</b> (at the DEJ) → TENSE blisters in the <b>elderly</b>, mucosa usually spared, Nikolsky NEGATIVE."},
      {l:"C",t:"Dermatitis herpetiformis",correct:false,e:"Intensely itchy grouped vesicles on extensors, linked to coeliac disease — not flaccid oral bullae."},
      {l:"D",t:"Stevens–Johnson syndrome",correct:false,e:"Drug-related, acute, with target lesions and mucosal sloughing over days — a distinct emergency."},
      {l:"E",t:"Epidermolysis bullosa",correct:false,e:"Inherited mechanobullous disorders presenting typically from birth/childhood."}
    ],
    keyPoint:"Pemphigus = intra-epidermal, flaccid, oral, Nikolsky POSITIVE, dangerous. Pemphigoid = sub-epidermal (DEJ), tense, elderly, Nikolsky NEGATIVE.",
    keyDiff:"<b>'P-emphigus = P-ainful & oral, flaccid, Nikolsky +.'</b> Pemphigoid = tense bullae, mucosa spared, Nikolsky −.",
    sum:{headers:["Feature","Pemphigus vulgaris","Bullous pemphigoid"],rows:[["Split level","Intra-epidermal","Sub-epidermal (DEJ)"],["Blister","Flaccid","Tense"],["Mucosa","Often involved","Usually spared"],["Nikolsky","Positive","Negative"],["Age","Middle-aged","Elderly"]]},
    refs:"Robbins; Davidson's" },
  { id:"der3", topic:"Infections", source:"Block 6 Summative · Univ of Kufa",
    stem:"A child has an <b>annular, scaly plaque with central clearing</b> and a raised advancing edge on the trunk. <b>KOH microscopy shows branching hyphae.</b> What is the first-line treatment?",
    choices:[
      {l:"A",t:"Topical terbinafine",correct:true,e:"Localised <b>tinea corporis</b> (a dermatophyte, confirmed by KOH hyphae) responds to a topical antifungal such as terbinafine."},
      {l:"B",t:"Topical hydrocortisone",correct:false,e:"A steroid alone worsens/masks dermatophytes ('tinea incognito') — avoid."},
      {l:"C",t:"Oral aciclovir",correct:false,e:"Antiviral — wrong organism (hyphae indicate a fungus, not a virus)."},
      {l:"D",t:"Topical mupirocin",correct:false,e:"An antibacterial for localised impetigo — not antifungal."},
      {l:"E",t:"Oral griseofulvin",correct:false,e:"Reserved for extensive disease or scalp/nail involvement, not a single localised body plaque."}
    ],
    keyPoint:"Annular plaque + central clearing + KOH hyphae = dermatophyte (tinea). Localised disease → topical terbinafine; never a steroid alone.",
    keyDiff:"KOH <b>hyphae</b> → dermatophyte (antifungal). KOH 'spaghetti & meatballs' → pityriasis versicolor. Steroid alone = tinea incognito.",
    sum:{headers:["Clue","Meaning"],rows:[["Annular, central clearing","Tinea (dermatophyte)"],["KOH hyphae","Confirms fungus"],["Localised","Topical terbinafine"],["Scalp/nail/extensive","Oral antifungal"]]},
    refs:"NICE CKS; Davidson's" }
]}

];

/* flatten lookup */
export const QMAP = {};
export function buildIndex(){
  for(const k in QMAP) delete QMAP[k];
  BANK.forEach(p=>p.questions.forEach(q=>{
    q.packId=p.id; q.packTitle=p.title;
    if(!q.system) q.system = p.title;
    if(!q.reference) q.reference = (typeof q.source==="string"? q.source : "") || "Other";
    QMAP[q.id]=q;
  }));
  applyEdits();
}
export function correctLabel(q){ const c=q.choices&&q.choices.find(x=>x.correct); return c?c.l:null; }

/* ============================================================
   REMOTE BANK SYNC
   Pulls canonical packs from a hosted manifest (GitHub Pages / raw),
   caches them, and falls back to the bundled bank when offline or
   no source is set. This is the real §2 mechanism; in this sandbox
   it will usually fall back to bundled (no repo / cross-origin limits).
   ============================================================ */
export async function syncBank(base){
  base=(base||"").trim().replace(/\/+$/,"");
  if(!base) throw new Error("no source");
  const mfRes=await fetch(base+"/manifest.json",{cache:"no-store"});
  if(!mfRes.ok) throw new Error("manifest "+mfRes.status);
  const mf=await mfRes.json();
  // leaderboard endpoint travels in the manifest → every device gets it automatically, no per-user setup
  if(mf.leaderboard !== undefined){ DB.settings.groupEndpoint = mf.leaderboard || ""; save.settings(); }
  const packs=[];
  for(const entry of (mf.packs||[])){
    const u=/^https?:/.test(entry.url)? entry.url : base+"/"+entry.url;
    const r=await fetch(u,{cache:"no-store"}); if(!r.ok) throw new Error(entry.packId+" "+r.status);
    packs.push(adaptPack(await r.json()));
  }
  if(!packs.length) throw new Error("empty manifest");
  BANK.length=0; packs.forEach(p=>BANK.push(p)); buildIndex();
  wsSet("medrecall:bankcache:v1", packs);   // keep a copy for offline / instant start
  return packs.reduce((n,p)=>n+p.questions.length,0);
}
export function adaptPack(c){
  return { id:c.packId, title:c.title, color:c.color||"#3fb6a8",
    questions:(c.questions||[]).map(q=>{
      const hasSys = q.topic && q.topic.includes(" · ");
      const system = q.system || (hasSys? q.topic.split(" · ")[0] : null) || c.title;
      const topic  = q.topic ? (hasSys? q.topic.split(" · ").slice(1).join(" · ") : q.topic) : "General";
      const reference = q.reference || (q.source && (q.source.part || q.source.paper)) || "Other";
      return {
        id:q.id, stage:c.stage||"5th Stage", type:q.type||"mcq", system, reference, topic,
        source:typeof q.source==="string"?q.source:[q.source&&q.source.paper, q.source&&q.source.institution].filter(Boolean).join(" · "),
        stem:q.stem,
        choices:(q.choices||[]).map(ch=>({l:ch.label,t:ch.text,correct:!!ch.correct,e:ch.explanation})),
        optionsTitle:q.optionsTitle||null, modelAnswer:q.modelAnswer||null,
        keyPoint:q.keyPoint, keyDiff:q.keyDifferentiator||null, sum:q.summaryTable||null,
        flag:q.flag?{severity:q.flag.severity,app:q.flag.appAnswer,correct:q.flag.correctAnswer,source:q.flag.source,note:q.flag.note}:undefined,
        refs:q.references||null
      };
    }) };
}

/* ============================================================
   APP STATE
   ============================================================ */
export const App = { screen:"home", nav:{system:null,type:null,reference:null}, collapsedStages:{}, practice:null, exam:null, examResult:null, builder:null, examReview:false };
let ghToken=null; // fine-grained GitHub token, stored only on this device (for posting your own leaderboard score)
const $ = id => document.getElementById(id);
export const esc = s => String(s).replace(/[&<>"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
export const stripBold = s => String(s).replace(/<\/?b>/g,""); // remove emphasis cues while a question is being answered

export function dueCount(packId){
  const t=today(); let n=0;
  const questions = packId ? (BANK.find(p=>p.id===packId)||{questions:[]}).questions : Object.values(QMAP);
  questions.forEach(q=>{
    const p=DB.progress.questions[q.id];
    if(!p || !p.srs) return; // new cards counted separately
    if(p.srs.due && p.srs.due<=t) n++;
  });
  return n;
}
export function seenCount(packId){
  const arr = (BANK.find(p=>p.id===packId)||{questions:[]}).questions;
  return arr.filter(q=>DB.progress.questions[q.id]).length;
}
export function masteredCount(packId){
  const arr = (BANK.find(p=>p.id===packId)||{questions:[]}).questions;
  return arr.filter(q=>{const p=DB.progress.questions[q.id];return p&&p.srs&&p.srs.interval>=21;}).length;
}

/* ---- browse hierarchy: System → Reference → Topic ---- */
const allQs = () => Object.values(QMAP);
const qSys = q => q.system || q.packTitle || "Other";
const qStage = q => q.stage || "5th Stage";
const missCount = id => { const p=DB.progress.questions[id]; return (p&&p.history)? p.history.filter(h=>!h.correct).length : 0; };
const mistakeIds = () => Object.keys(QMAP).filter(id=>missCount(id)>0);
const mistakePool = () => mistakeIds().sort((a,b)=>{ const pa=DB.progress.questions[a]||{}, pb=DB.progress.questions[b]||{}; const wa=pa.lastResult==='wrong'?1:0, wb=pb.lastResult==='wrong'?1:0; return (wb-wa)||(missCount(b)-missCount(a))||((pb.lastSeen||'').localeCompare(pa.lastSeen||'')); });
const cramPool = (limit) => {                       // Exam-tomorrow cram: highest-yield first
  limit = limit || 40;
  const t=today(), P=DB.progress.questions, seen=new Set(), out=[];
  const push=id=>{ if(QMAP[id] && !seen.has(id)){ seen.add(id); out.push(id); } };
  Object.keys(P).filter(id=>P[id].marked).forEach(push);                                  // 1 you flagged it
  Object.keys(P).filter(id=>P[id].lastResult==='wrong').forEach(push);                    // 2 missed last time
  mistakeIds().sort((a,b)=>missCount(b)-missCount(a)).forEach(push);                       // 3 missed ever
  allQs().forEach(q=>{ const p=P[q.id]; if(p&&p.srs&&p.srs.due&&p.srs.due<=t) push(q.id); });// 4 due today
  Object.keys(P).filter(id=>{ const p=P[id]; return p.seen>=2 && (p.correct/p.seen)<0.6; }).forEach(push); // 5 weak
  if(out.length<limit){ const fresh=allQs().filter(q=>!P[q.id]).map(q=>q.id);
    for(let i=fresh.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); const x=fresh[i];fresh[i]=fresh[j];fresh[j]=x; }
    fresh.forEach(push); }                                                                  // 6 fill with fresh
  return out.slice(0, limit);
};
const disputedIds = () => Object.keys(QMAP).filter(id=>!!QMAP[id].flag);
const RED_FLAGS = ["ectopic","torsion","cord prolapse","neutropenic","sepsis","septic","ketoacidosis","dka","anaphylax","postpartum h","pph","raised icp","intracranial pressure","subarachnoid","meningitis","status epilepticus","eclampsia","tension pneumothorax","aortic dissection","cauda equina","tamponade","serotonin syndrome","neuroleptic malignant","suicid","self-harm","angle closure","acute glaucoma","compartment syndrome","epiglottitis","necrotis","necrotiz","shock","placental abruption","placenta praevia","placenta previa","amniotic fluid embol","malignant hyperthermia","thyroid storm","addisonian","hyperkalaem","myocardial infarction","pulmonary embol","variceal","gi bleed","abruption","subdural","extradural","torsade","wernicke"];
const redFlagIds = () => Object.keys(QMAP).filter(id=>{ const q=QMAP[id]; const hay=((q.topic||"")+" "+(q.stem||"")).toLowerCase(); return RED_FLAGS.some(k=>hay.includes(k)); });
const CHECKLISTS = {
  "Obstetrics & Gynaecology":[
    {t:"PPH — the 4 Ts + step-wise management",k:["postpartum","pph","haemorrhage","atony","uterine aton"]},
    {t:"Ectopic pregnancy — diagnosis + management options",k:["ectopic"]},
    {t:"Pre-eclampsia / eclampsia — MgSO4, labetalol, delivery",k:["eclampsia","pre-eclampsia","preeclampsia","magnesium","proteinuria"]},
    {t:"CTG interpretation — DR C BRAVADO",k:["ctg","cardiotocograph","fetal heart","decelerat"]},
    {t:"Cord prolapse — immediate steps",k:["cord prolapse"]},
    {t:"Anti-D — indications & sensitising events",k:["anti-d","rhesus","rh d","rh-d"]},
    {t:"PROM / preterm labour — tocolysis & steroids",k:["prom","preterm","rupture of membranes","tocolytic"]},
    {t:"Placenta praevia vs abruption",k:["praevia","previa","abruption","antepartum"]},
    {t:"Menorrhagia / fibroids",k:["fibroid","menorrhagia","heavy menstrual"]},
    {t:"Gynae cancer red flags (ovarian, cervical, endometrial)",k:["ovarian","cervical","endometrial","ca 125","colposcopy","post-menopausal bleed"]}],
  "Paediatrics":[
    {t:"Neonatal jaundice — causes by age of onset",k:["jaundice","bilirubin","kernicterus"]},
    {t:"Febrile child / sepsis — NICE traffic lights",k:["febrile","sepsis","fever","meningococc"]},
    {t:"Stridor — croup vs epiglottitis vs bronchiolitis",k:["croup","epiglottitis","bronchiolitis","stridor"]},
    {t:"Developmental milestones & red flags",k:["milestone","development","delay"]},
    {t:"Congenital heart disease — cyanotic vs acyanotic",k:["tetralogy","congenital heart","murmur","cyanotic","ductus"]},
    {t:"Paediatric DKA — fluids & insulin",k:["ketoacidosis","dka","diabet"]},
    {t:"Non-accidental injury — safeguarding",k:["non-accidental","abuse","safeguard","neglect"]},
    {t:"Vaccination schedule",k:["vaccin","immunis","immuniz"]}],
  "Neurology":[
    {t:"Stroke — territory localisation + thrombolysis window",k:["stroke","mca","infarct","thrombolys"]},
    {t:"SAH — CT then LP (xanthochromia)",k:["subarachnoid","thunderclap"]},
    {t:"Status epilepticus — the drug ladder",k:["status epilepticus","seizure"]},
    {t:"MS — McDonald criteria + relapse Rx",k:["multiple sclerosis","mcdonald","optic neuritis","demyelinat"]},
    {t:"Myasthenia gravis vs LEMS",k:["myasthenia","lambert","fatigab"]},
    {t:"Parkinsonism — PD vs drug/atypical",k:["parkinson","bradykinesia","lewy"]},
    {t:"Cord compression / cauda equina — emergency",k:["cord compression","cauda equina","intracranial pressure"]},
    {t:"Meningitis/encephalitis — CSF patterns",k:["meningitis","encephalitis","csf"]},
    {t:"Bell's palsy vs UMN facial weakness",k:["bell","facial nerve","facial palsy"]}],
  "Psychiatry":[
    {t:"Suicide / self-harm risk assessment",k:["suicid","self-harm","risk assess"]},
    {t:"Serotonin syndrome vs NMS",k:["serotonin syndrome","neuroleptic malignant"]},
    {t:"Depression — first-line + referral",k:["depress","ssri","antidepress"]},
    {t:"Bipolar / mania — mood stabilisers",k:["bipolar","mania","manic","lithium"]},
    {t:"Schizophrenia — first-rank + antipsychotics",k:["schizophren","psychosis","antipsychotic","first-rank","delusion","hallucin"]},
    {t:"Delirium vs dementia",k:["delirium","dementia","confusion"]},
    {t:"Lithium toxicity & monitoring",k:["lithium"]},
    {t:"Alcohol withdrawal / Wernicke",k:["alcohol","withdrawal","wernicke","delirium tremens"]},
    {t:"Mental Health Act / capacity basics",k:["mental health act","section","capacity","detain"]}],
  "Haematology & Oncology":[
    {t:"Neutropenic sepsis — antibiotics within 1 hour",k:["neutropenic","sepsis"]},
    {t:"Acute leukaemia — BMA >20% blasts",k:["leukaemia","leukemia","blast","bone marrow"]},
    {t:"Anaemia — micro / normo / macrocytic",k:["anaemia","anemia","microcytic","macrocytic","mcv"]},
    {t:"Sickle cell crisis — management",k:["sickle","vaso-occlus"]},
    {t:"Lymphoma — Hodgkin vs non-Hodgkin",k:["lymphoma","hodgkin","reed-sternberg"]},
    {t:"VTE — Wells + anticoagulation",k:["dvt","pulmonary embol","wells","anticoagul","thrombo"]},
    {t:"Transfusion reactions",k:["transfusion","haemolytic","abo"]},
    {t:"Myeloma — CRAB features",k:["myeloma","bence","crab"]}],
  "Dermatology":[
    {t:"Melanoma — ABCDE + Breslow",k:["melanoma","breslow","mole","pigmented"]},
    {t:"SCC vs BCC",k:["squamous cell","basal cell"]},
    {t:"Psoriasis — types + treatment ladder",k:["psoriasis"]},
    {t:"Eczema / atopic dermatitis",k:["eczema","atopic","dermatitis"]},
    {t:"SJS / TEN — drug triggers",k:["stevens","toxic epidermal"]},
    {t:"Bullous — pemphigus vs pemphigoid",k:["pemphigus","pemphigoid","bullous"]},
    {t:"Skin infection — cellulitis / necrotising",k:["cellulitis","necrotis","erysipelas"]}],
  "ENT":[
    {t:"Epistaxis — management ladder",k:["epistaxis","nosebleed","nasal bleed"]},
    {t:"Otitis media vs OME (glue ear)",k:["otitis media","glue ear","effusion"]},
    {t:"Vertigo — BPPV vs Meniere vs neuritis",k:["vertigo","bppv","meniere","vestibular"]},
    {t:"Sudden sensorineural hearing loss — emergency",k:["sensorineural","hearing loss"]},
    {t:"Tonsillitis / quinsy",k:["tonsill","quinsy","peritonsillar"]},
    {t:"Head & neck red-flag neck lump",k:["neck lump","head and neck","laryng"]}],
  "Ophthalmology":[
    {t:"Acute red eye — differentials",k:["red eye","conjunctivitis","uveitis","scleritis","keratitis"]},
    {t:"Acute angle-closure glaucoma — emergency",k:["angle closure","glaucoma"]},
    {t:"Sudden painless visual loss — CRAO/CRVO/detachment",k:["central retinal","retinal detach","amaurosis","painless"]},
    {t:"Diabetic / hypertensive retinopathy",k:["retinopathy"]},
    {t:"RAPD / optic neuritis",k:["rapd","afferent pupillary","optic neuritis"]},
    {t:"Orbital vs preseptal cellulitis",k:["orbital cellulitis","preseptal","periorbital"]}]
};
const checklistMatch = (sys,item) => Object.keys(QMAP).filter(id=>{ const q=QMAP[id]; if(qSys(q)!==sys) return false; const hay=((q.topic||"")+" "+(q.stem||"")).toLowerCase(); return item.k.some(k=>hay.includes(k)); });
export const DUELS = [
 {sys:"Gastro",a:"Crohn's disease",b:"Ulcerative colitis",correct:"a",stem:"Transmural inflammation with SKIP lesions, perianal fistula and non-caseating granulomas; terminal ileum involved.",why:"Transmural + skip lesions + granulomas + fistulae = Crohn's. UC is continuous, mucosa-only, rectum-upward, with NO granulomas."},
 {sys:"Ophthalmology",a:"Central retinal artery occlusion",b:"Retinal detachment",correct:"a",stem:"Sudden PAINLESS total visual loss; pale retina with a CHERRY-RED SPOT and an RAPD.",why:"Cherry-red spot + pale retina + RAPD = CRAO. Detachment gives a 'curtain'/flashes/floaters with a raised, folded retina."},
 {sys:"Obs & Gynae",a:"Salpingectomy",b:"Salpingotomy",correct:"a",stem:"Ruptured ectopic, haemodynamically UNSTABLE, with a healthy contralateral tube.",why:"Ruptured/unstable or healthy other tube -> salpingectomy (remove tube). Salpingotomy (conserve) only if the OTHER tube is damaged and fertility is wanted."},
 {sys:"Paediatrics",a:"Kwashiorkor",b:"Marasmus",correct:"a",stem:"Toddler with OEDEMA, fatty hepatomegaly, skin/hair depigmentation and a near-normal weight-for-age.",why:"Oedema + fatty liver = kwashiorkor (protein deficiency). Marasmus = severe wasting with NO oedema (global calorie deficiency)."},
 {sys:"Psychiatry",a:"Postpartum blues",b:"Postnatal depression",correct:"a",stem:"Day 4 postpartum: tearful and labile, fully resolves by day 10 with no treatment.",why:"Onset day 3-10, transient, self-limiting = blues. PND: onset over weeks, persistent low mood >2 weeks, needs treatment."},
 {sys:"Respiratory",a:"Pulmonary embolism",b:"Pneumonia",correct:"a",stem:"Sudden pleuritic pain + hypoxia + tachycardia, CLEAR chest, recent long-haul flight, no fever.",why:"Sudden onset, hypoxia out of proportion, clear lungs, VTE risk = PE. Pneumonia: fever, productive cough, focal crackles/consolidation."},
 {sys:"Paediatrics",a:"Congenital CMV",b:"Congenital toxoplasmosis",correct:"a",stem:"Neonate with PERIVENTRICULAR calcification, microcephaly, sensorineural deafness and a blueberry-muffin rash.",why:"PERIventricular calcification + deafness = CMV. Toxoplasmosis = DIFFUSE intracranial calcification + chorioretinitis + hydrocephalus."},
 {sys:"Nephrology",a:"Minimal change disease",b:"Post-streptococcal GN",correct:"a",stem:"Child with generalised oedema, heavy proteinuria, NORMAL BP and complement, no haematuria.",why:"Nephrotic (proteinuria, oedema, normal C3) = minimal change. Post-strep GN is nephritic: haematuria, HTN, LOW C3, 1-2 wks after infection."},
 {sys:"Psychiatry",a:"Delirium",b:"Dementia",correct:"a",stem:"Acute FLUCTUATING confusion over 2 days, inattention, visual hallucinations, drowsy, post-operative.",why:"Acute + fluctuating + inattention + altered consciousness = delirium. Dementia is chronic, progressive, with CLEAR consciousness."},
 {sys:"Psychiatry",a:"Neuroleptic malignant syndrome",b:"Serotonin syndrome",correct:"a",stem:"Days after starting an ANTIPSYCHOTIC: lead-pipe RIGIDITY, hyperthermia, reduced reflexes, very high CK.",why:"Antipsychotic + lead-pipe rigidity + HYPO-reflexia + high CK, slow onset = NMS. Serotonin syndrome: serotonergic drug, HYPER-reflexia/clonus, rapid onset."},
 {sys:"Paediatrics",a:"Epiglottitis",b:"Croup",correct:"a",stem:"Rapid onset, DROOLING, tripod posture, muffled voice, high fever and NO cough; toxic-looking child.",why:"Drooling + tripod + no cough + toxic = epiglottitis (H. influenzae b). Croup: BARKING cough, stridor, low-grade fever, gradual, viral."},
 {sys:"ENT",a:"BPPV",b:"Meniere's disease",correct:"a",stem:"Brief vertigo lasting <1 minute, triggered by head turning, with NO hearing loss or tinnitus.",why:"Seconds, positional, no auditory symptoms = BPPV. Meniere's: vertigo lasting minutes-hours + tinnitus + fluctuating hearing loss + aural fullness."},
 {sys:"Neurology",a:"Bell's palsy (LMN)",b:"Stroke (UMN facial)",correct:"a",stem:"Unilateral facial droop INCLUDING the forehead, unable to close the eye, no limb signs.",why:"FOREHEAD involved = lower motor neuron = Bell's. A stroke (UMN) SPARES the forehead and has other CNS signs."},
 {sys:"Obs & Gynae",a:"Placental abruption",b:"Placenta praevia",correct:"a",stem:"PAINFUL bleeding with a tense, tender 'woody' uterus, fetal distress and shock out of proportion to visible loss.",why:"Painful + hard tender uterus + concealed bleed = abruption. Praevia: PAINLESS bleeding, soft non-tender uterus, often malpresentation."},
 {sys:"Neurology",a:"Subarachnoid haemorrhage",b:"Migraine",correct:"a",stem:"Instant THUNDERCLAP worst-ever headache peaking in seconds, with neck stiffness and photophobia.",why:"Thunderclap (max <1 min) + meningism = SAH -> CT then LP for xanthochromia. Migraine builds over minutes-hours, recurrent, with aura."},
 {sys:"Endocrine",a:"DKA",b:"HHS",correct:"a",stem:"Young type-1 diabetic, ketones, Kussmaul breathing, pH 7.1, glucose 22 mmol/L over hours.",why:"Ketones + acidosis + young T1DM = DKA. HHS: elderly T2DM, glucose often >33, very high osmolality, MINIMAL ketones, no acidosis, over days."},
 {sys:"Neurology",a:"Wernicke encephalopathy",b:"Korsakoff syndrome",correct:"a",stem:"Alcoholic with the ACUTE triad of confusion + ophthalmoplegia + ataxia.",why:"Acute, REVERSIBLE triad = Wernicke (give IV thiamine now). Korsakoff: chronic, irreversible anterograde amnesia with confabulation."},
 {sys:"Haematology",a:"B12 deficiency",b:"Folate deficiency",correct:"a",stem:"Macrocytic anaemia WITH peripheral neuropathy and loss of proprioception.",why:"Macrocytic + NEUROLOGICAL signs (subacute combined degeneration) = B12. Folate deficiency is macrocytic WITHOUT neuro signs; replace B12 first."},
 {sys:"Respiratory",a:"Asthma",b:"COPD",correct:"a",stem:"Young non-smoker, episodic wheeze with diurnal variation, FULLY reversible on spirometry, atopic history.",why:"Reversible airflow + young + atopy + variability = asthma. COPD: smoker, FIXED/irreversible obstruction, progressive."},
 {sys:"Endocrine",a:"Graves' disease",b:"Hashimoto's thyroiditis",correct:"a",stem:"Young woman: weight loss, tremor, EYE bulging, pretibial myxoedema and a diffuse goitre.",why:"Thyrotoxic + ophthalmopathy + pretibial myxoedema = Graves' (TSH-receptor antibody). Hashimoto's is HYPO-thyroid with anti-TPO and a firm goitre."},
 {sys:"Cardiology",a:"Pericarditis",b:"STEMI",correct:"a",stem:"Sharp pleuritic chest pain RELIEVED by sitting forward, SADDLE-shaped ST elevation in all leads, friction rub.",why:"Positional pain + widespread saddle ST + PR depression + rub = pericarditis. STEMI: territorial ST elevation with reciprocal change, crushing pain."},
 {sys:"Obs & Gynae",a:"Pre-eclampsia",b:"Gestational hypertension",correct:"a",stem:"After 20 weeks: BP 160/110 WITH proteinuria (++), headache and brisk reflexes.",why:"Hypertension + PROTEINURIA / end-organ signs after 20 wks = pre-eclampsia. Gestational HTN is new hypertension WITHOUT proteinuria or organ involvement."},
 {sys:"Neurology",a:"Bacterial meningitis",b:"Viral meningitis",correct:"a",stem:"CSF: TURBID, neutrophils high, glucose LOW, protein high.",why:"Low glucose + neutrophils + high protein + turbid = bacterial. Viral: clear CSF, lymphocytes, NORMAL glucose, only mildly high protein."},
 {sys:"Cardiology",a:"Aortic stenosis",b:"Mitral regurgitation",correct:"a",stem:"Ejection-systolic murmur radiating to the CAROTIDS, with a slow-rising pulse and exertional syncope.",why:"ESM to carotids + slow-rising pulse + syncope = aortic stenosis. MR: PANsystolic murmur radiating to the AXILLA, with a displaced apex."},
 {sys:"Gastro",a:"Acute pancreatitis",b:"Perforated peptic ulcer",correct:"a",stem:"Severe epigastric pain radiating to the BACK, relieved by sitting forward, raised AMYLASE/LIPASE, gallstones.",why:"Back radiation + high amylase/lipase = pancreatitis. Perforated ulcer: sudden pain, RIGID 'board-like' abdomen, free air under the diaphragm on erect CXR."},
 {sys:"Surgery",a:"Appendicitis",b:"Mesenteric adenitis",correct:"a",stem:"Child: periumbilical pain MIGRATING to the right iliac fossa, anorexia, low fever, McBurney tenderness.",why:"Migratory RIF pain + anorexia + McBurney = appendicitis. Mesenteric adenitis: recent URTI, higher fever, less localised, self-limiting."},
 {sys:"Cardiology",a:"Stable angina",b:"Unstable angina",correct:"a",stem:"Central chest pain ONLY on exertion, relieved by rest or GTN within minutes, troponin normal.",why:"Predictable, exertional, relieved by rest = stable. Unstable: pain at REST or crescendo with a normal troponin (NSTEMI = troponin rise)."},
 {sys:"Respiratory",a:"COPD exacerbation",b:"Heart failure",correct:"a",stem:"Smoker: worsening dyspnoea + PURULENT sputum + wheeze, hyperinflated chest, no orthopnoea.",why:"Purulent sputum + wheeze + smoking = COPD. Heart failure: orthopnoea, PND, raised JVP, bibasal fine crackles, ankle oedema."},
 {sys:"Endocrine",a:"Type 1 diabetes",b:"Type 2 diabetes",correct:"a",stem:"Lean teenager: weeks of polyuria/polydipsia + WEIGHT LOSS, ketones present.",why:"Young, lean, rapid onset, ketosis-prone = T1DM (autoimmune; needs insulin). T2DM: older, overweight, gradual, insulin resistance."},
 {sys:"Nephrology",a:"Nephrotic syndrome",b:"Nephritic syndrome",correct:"a",stem:"Heavy PROTEINURIA (>3.5 g), hypoalbuminaemia, generalised OEDEMA, no haematuria.",why:"Massive proteinuria + oedema + low albumin = nephrotic. Nephritic: HAEMATURIA, hypertension, mild proteinuria, oliguria, RBC casts."},
 {sys:"Neurology",a:"Delirium tremens",b:"Wernicke encephalopathy",correct:"a",stem:"72 h after stopping alcohol: agitation, VISUAL HALLUCINATIONS, tremor, tachycardia, fever.",why:"48–72 h post-cessation + hallucinations + autonomic storm = DTs (benzodiazepines). Wernicke: confusion + ophthalmoplegia + ataxia (IV thiamine)."},
 {sys:"Rheumatology",a:"Rheumatoid arthritis",b:"Osteoarthritis",correct:"a",stem:"Symmetrical small-joint pain, MORNING STIFFNESS >1 h easing with use, MCP/PIP swelling, anti-CCP positive.",why:"Symmetrical + prolonged morning stiffness + anti-CCP + MCP/PIP = RA. OA: asymmetrical, worse with use, DIP nodes (Heberden's), brief stiffness."},
 {sys:"Rheumatology",a:"Gout",b:"Pseudogout",correct:"a",stem:"Acute mono-arthritis of the FIRST MTP; NEGATIVELY birefringent NEEDLE-shaped crystals.",why:"First MTP + negatively birefringent needles (urate) = gout. Pseudogout: knee, POSITIVELY birefringent RHOMBOID crystals (CPPD), chondrocalcinosis."},
 {sys:"Gastro",a:"Crohn's disease",b:"Coeliac disease",correct:"b",stem:"Chronic diarrhoea + weight loss; jejunal biopsy shows VILLOUS ATROPHY, anti-TTG positive, itchy vesicular rash.",why:"Villous atrophy + anti-TTG + dermatitis herpetiformis = coeliac. Crohn's: transmural, granulomas, skip lesions, normal TTG."},
 {sys:"Haematology",a:"Iron deficiency anaemia",b:"Thalassaemia trait",correct:"a",stem:"Microcytic anaemia; LOW ferritin, raised TIBC, low transferrin saturation.",why:"Low ferritin + high TIBC = iron deficiency. Thalassaemia trait: normal/high ferritin, MCV very low out of proportion to mild anaemia, raised HbA2."},
 {sys:"Endocrine",a:"Cushing's syndrome",b:"Addison's disease",correct:"a",stem:"Central obesity, moon face, purple striae, proximal myopathy, HYPERtension, high cortisol.",why:"Cortisol EXCESS (central obesity, striae, HTN) = Cushing's. Addison's: cortisol DEFICIENCY — hypotension, hyperpigmentation, hyponatraemia, fatigue."},
 {sys:"Obs & Gynae",a:"Pre-eclampsia",b:"HELLP syndrome",correct:"b",stem:"32 weeks: hypertension + proteinuria PLUS haemolysis, raised LFTs, LOW platelets, RUQ pain.",why:"Haemolysis + Elevated Liver enzymes + Low Platelets = HELLP (severe pre-eclampsia variant). Pre-eclampsia alone lacks the HELLP triad."},
 {sys:"Paediatrics",a:"Intussusception",b:"Pyloric stenosis",correct:"a",stem:"6-month-old: episodic screaming drawing up the legs, REDCURRANT-JELLY stool, sausage-shaped mass.",why:"Redcurrant-jelly stool + colicky pain + sausage mass = intussusception (US: target sign). Pyloric stenosis: ~6-wk-old, NON-bilious projectile vomiting, olive mass, hypochloraemic alkalosis."},
 {sys:"Neurology",a:"Migraine",b:"Tension headache",correct:"a",stem:"Unilateral THROBBING headache, photophobia, nausea, worse with activity, lasting hours.",why:"Unilateral + throbbing + photophobia + nausea = migraine. Tension: bilateral BAND-like pressure, no nausea/photophobia, not worsened by activity."},
 {sys:"Ophthalmology",a:"Open-angle glaucoma",b:"Acute angle-closure glaucoma",correct:"a",stem:"Painless GRADUAL peripheral field loss, raised IOP, cupped disc, found on routine screening.",why:"Gradual, painless, peripheral loss = open-angle. Closed-angle: SUDDEN painful red eye, haloes, fixed mid-dilated pupil, nausea — an emergency."},
 {sys:"Psychiatry",a:"Schizophrenia",b:"Schizoaffective disorder",correct:"a",stem:"Persistent delusions + hallucinations for months with NO prominent mood episode.",why:"Psychosis without a major mood component = schizophrenia. Schizoaffective: psychosis PLUS a mood episode, with ≥2 weeks of psychosis WITHOUT mood symptoms."},
 {sys:"Endocrine",a:"Diabetes insipidus",b:"SIADH",correct:"a",stem:"Large volumes of DILUTE urine, HYPERnatraemia, high serum osmolality, intense thirst.",why:"Dilute urine + high sodium/osmolality = DI (ADH lack/resistance). SIADH: concentrated urine, HYPOnatraemia, low serum osmolality, euvolaemic."},
 {sys:"Cardiology",a:"First-degree heart block",b:"Mobitz II",correct:"a",stem:"Asymptomatic; ECG shows a FIXED prolonged PR (>200 ms), every P followed by a QRS.",why:"Fixed long PR, no dropped beats = first-degree (benign). Mobitz II: intermittent dropped QRS with CONSTANT PR — risk of complete block, needs pacing."},
 {sys:"Respiratory",a:"Pulmonary embolism",b:"Aortic dissection",correct:"b",stem:"Sudden TEARING chest pain radiating to the BACK, unequal arm BPs, widened mediastinum.",why:"Tearing pain to the back + unequal BPs + widened mediastinum = aortic dissection. PE: pleuritic pain, hypoxia, tachycardia, VTE risk factors."},
 {sys:"Paediatrics",a:"Kawasaki disease",b:"Scarlet fever",correct:"a",stem:"Child: fever >5 days, bilateral non-purulent CONJUNCTIVITIS, cracked lips, strawberry tongue, peeling hands.",why:"Fever ≥5 d + conjunctivitis + mucositis + extremity changes = Kawasaki (coronary aneurysm risk; IVIG + aspirin). Scarlet fever: sandpaper rash, sore throat, responds to penicillin."},
 {sys:"Gastro",a:"Biliary colic",b:"Acute cholecystitis",correct:"a",stem:"RUQ pain after fatty meals lasting <6 h, NO fever, Murphy's sign NEGATIVE, normal WCC.",why:"Transient RUQ pain, no fever, no inflammation = biliary colic. Cholecystitis: persistent pain + FEVER + Murphy's POSITIVE + raised WCC."},
 {sys:"Dermatology",a:"Bullous pemphigoid",b:"Pemphigus vulgaris",correct:"a",stem:"Elderly: TENSE itchy blisters on flexures, mucosa SPARED, Nikolsky NEGATIVE.",why:"Tense blisters, mucosa spared, Nikolsky negative, elderly = bullous pemphigoid (sub-epidermal). Pemphigus: FLACCID blisters, mucosa involved, Nikolsky POSITIVE."},
 {sys:"Cardiology",a:"STEMI",b:"NSTEMI",correct:"a",stem:"Crushing chest pain; ECG shows ST ELEVATION in II, III, aVF.",why:"Persistent ST elevation = STEMI (immediate reperfusion/PCI). NSTEMI: ST depression/T-wave inversion + troponin rise, no persistent ST elevation."},
 {sys:"Neurology",a:"Multiple sclerosis",b:"Neuromyelitis optica",correct:"a",stem:"Young woman: optic neuritis + brainstem signs; periventricular T2 lesions, oligoclonal bands positive.",why:"Periventricular lesions + oligoclonal bands = MS. NMO (Devic): LONGITUDINALLY EXTENSIVE myelitis + optic neuritis, anti-AQP4 positive, bands usually absent."},
 {sys:"Endocrine",a:"Graves' disease",b:"Toxic multinodular goitre",correct:"a",stem:"Thyrotoxicosis with EYE signs + pretibial myxoedema + diffuse smooth goitre.",why:"Eye signs + pretibial myxoedema + diffuse goitre = Graves'. Toxic MNG: older, nodular gland, NO eye signs, patchy isotope uptake."},
 {sys:"Respiratory",a:"Asthma",b:"Vocal cord dysfunction",correct:"b",stem:"Episodic dyspnoea with INSPIRATORY stridor, normal spirometry between episodes, no bronchodilator response.",why:"Inspiratory stridor + normal spirometry + no bronchodilator response = vocal cord dysfunction. Asthma: EXPIRATORY wheeze, reversible obstruction, responds to salbutamol."},
 {sys:"Gastro",a:"Ulcerative colitis",b:"Ischaemic colitis",correct:"b",stem:"Elderly: sudden LEFT-sided pain + bloody diarrhoea after a hypotensive episode; splenic flexure affected.",why:"Sudden, post-hypotension, watershed (splenic flexure) = ischaemic colitis. UC: chronic, continuous from the rectum, younger, relapsing-remitting."},
 {sys:"Paediatrics",a:"Bronchiolitis",b:"Viral-induced wheeze",correct:"a",stem:"Under-1 in winter: coryza then wheeze + fine crackles + distress, RSV positive, first episode.",why:"<1 yr + RSV + crackles + first episode = bronchiolitis (supportive). Viral-induced wheeze: older toddler, recurrent wheeze with URTIs, responds to bronchodilators."},
 {sys:"Psychiatry",a:"Major depression",b:"Adjustment disorder",correct:"a",stem:"Persistent low mood, anhedonia, early-morning waking and weight loss for 6 weeks, no clear trigger.",why:"Pervasive low mood + biological symptoms ≥2 weeks = major depression. Adjustment disorder: milder, tied to an identifiable stressor, resolves with adaptation."},
 {sys:"Neurology",a:"Parkinson's disease",b:"Essential tremor",correct:"a",stem:"Asymmetric RESTING pill-rolling tremor + bradykinesia + rigidity, improves with movement.",why:"Resting tremor + bradykinesia + rigidity = Parkinson's. Essential tremor: ACTION/postural, symmetrical, improves with alcohol, family history, no bradykinesia."},
 {sys:"Obs & Gynae",a:"Threatened miscarriage",b:"Inevitable miscarriage",correct:"a",stem:"Under 12 weeks: vaginal bleeding but a viable fetus and a CLOSED cervical os.",why:"Bleeding + closed os + viable = threatened (may continue). Inevitable: bleeding + OPEN os ± products at the os; the pregnancy will not continue."},
 {sys:"Haematology",a:"DIC",b:"ITP",correct:"a",stem:"Septic patient: bleeding from multiple sites; LOW platelets, LOW fibrinogen, raised D-dimer, prolonged PT/APTT.",why:"Consumptive coagulopathy (low fibrinogen, high D-dimer, long PT/APTT) = DIC. ITP: ISOLATED low platelets, normal clotting, otherwise well."},
 {sys:"Endocrine",a:"Hashimoto's thyroiditis",b:"De Quervain's thyroiditis",correct:"a",stem:"PAINLESS firm goitre + hypothyroidism + anti-TPO antibodies.",why:"Painless goitre + hypothyroid + anti-TPO = Hashimoto's. De Quervain's: PAINFUL tender goitre after a viral illness, transient thyrotoxicosis, raised ESR, LOW uptake."},
 {sys:"Cardiology",a:"Cardiac tamponade",b:"Tension pneumothorax",correct:"a",stem:"Shock + raised JVP + MUFFLED heart sounds + pulsus paradoxus after a stab wound; trachea central.",why:"Beck's triad (hypotension, raised JVP, muffled sounds) + pulsus paradoxus = tamponade. Tension pneumothorax: trachea deviated AWAY, absent breath sounds, hyper-resonance."},
 {sys:"Nephrology",a:"Pre-renal AKI",b:"Acute tubular necrosis",correct:"a",stem:"Oliguria after hypovolaemia; urine Na LOW (<20), urine:plasma osmolality HIGH, no casts.",why:"Low urine Na + concentrated urine + responds to fluids = pre-renal. ATN: urine Na HIGH (>40), isosthenuric, MUDDY-BROWN granular casts, no fluid response."},
 {sys:"Dermatology",a:"Cellulitis",b:"Necrotising fasciitis",correct:"b",stem:"Rapidly spreading erythema with pain OUT OF PROPORTION, systemic toxicity, skin crepitus.",why:"Pain out of proportion + crepitus + rapid toxicity = necrotising fasciitis (surgical emergency). Cellulitis: well, localised warm erythema, responds to antibiotics."},
 {sys:"Neurology",a:"Cluster headache",b:"Trigeminal neuralgia",correct:"a",stem:"Severe UNILATERAL orbital pain in attacks with lacrimation, rhinorrhoea and a red eye, same time each night.",why:"Unilateral orbital pain + autonomic features + circadian clustering = cluster headache. Trigeminal neuralgia: brief electric-shock facial pains triggered by touch/chewing."},
 {sys:"Paediatrics",a:"Henoch-Schönlein purpura",b:"Immune thrombocytopenia",correct:"a",stem:"Child after URTI: palpable PURPURA on buttocks/legs + abdominal pain + arthralgia; platelets NORMAL.",why:"Palpable purpura + abdo pain + arthralgia + NORMAL platelets = HSP (IgA vasculitis). ITP: non-palpable petechiae with LOW platelets, no vasculitis."},
 {sys:"Gastro",a:"Hepatitis A",b:"Hepatitis B",correct:"a",stem:"Acute self-limiting jaundice after travel/contaminated food; faeco-oral, no chronic carriage.",why:"Faeco-oral + self-limiting + no chronicity = Hep A. Hep B: blood/sexual/vertical spread, can become CHRONIC (HBsAg)."},
 {sys:"Obs & Gynae",a:"Placenta praevia",b:"Vasa praevia",correct:"b",stem:"PAINLESS bleeding at membrane rupture with sudden FETAL bradycardia; fetal vessels run over the os.",why:"Bleeding at ROM + acute FETAL compromise = vasa praevia (fetal blood). Praevia: painless MATERNAL bleeding from a low placenta, mother destabilises first."},
 {sys:"Endocrine",a:"Primary hyperparathyroidism",b:"Secondary hyperparathyroidism",correct:"a",stem:"HIGH calcium + high PTH + low phosphate; renal stones in an otherwise-well outpatient.",why:"HIGH calcium + high PTH = primary (parathyroid adenoma). Secondary: LOW/normal calcium with high PTH, usually from CKD or vitamin D deficiency."},
 {sys:"Respiratory",a:"Sarcoidosis",b:"Tuberculosis",correct:"a",stem:"Young adult: bilateral hilar lymphadenopathy + erythema nodosum + raised ACE + NON-caseating granulomas.",why:"Bilateral hilar nodes + erythema nodosum + non-caseating granulomas + raised ACE = sarcoidosis. TB: CASEATING granulomas, acid-fast bacilli, upper-lobe cavitation, night sweats."},
 {sys:"Cardiology",a:"Atrial fibrillation",b:"Atrial flutter",correct:"a",stem:"Irregularly IRREGULAR pulse; ECG: no P waves, irregular R-R, fibrillatory baseline.",why:"Irregularly irregular + absent P waves = AF. Atrial flutter: REGULAR, SAWTOOTH flutter waves (often 2:1 at ~150 bpm)."},
 {sys:"Psychiatry",a:"Generalised anxiety disorder",b:"Panic disorder",correct:"a",stem:"6 months of persistent excessive worry about many things, restlessness, poor sleep, no discrete attacks.",why:"Chronic pervasive worry = GAD. Panic disorder: recurrent unexpected discrete PANIC ATTACKS peaking within minutes + fear of further attacks."},
 {sys:"Neurology",a:"Myasthenia gravis",b:"Lambert-Eaton syndrome",correct:"a",stem:"Fatigable PTOSIS and diplopia WORSENING through the day; anti-AChR antibodies.",why:"Fatigability worsening with use + ocular onset + anti-AChR = myasthenia. Lambert-Eaton: weakness IMPROVES with use, autonomic features, anti-VGCC, paraneoplastic (small-cell lung)."},
 {sys:"Haematology",a:"Hodgkin lymphoma",b:"Non-Hodgkin lymphoma",correct:"a",stem:"Young adult: painless cervical nodes, ALCOHOL-induced node pain, Reed-Sternberg cells.",why:"Reed-Sternberg cells + alcohol-induced pain + contiguous spread = Hodgkin. NHL: older, more widespread/extranodal, no Reed-Sternberg cells."},
 {sys:"Cardiology",a:"Hypertrophic cardiomyopathy",b:"Aortic stenosis",correct:"a",stem:"Young athlete: ejection systolic murmur that gets LOUDER on Valsalva/standing; family history of sudden death.",why:"HOCM murmur INCREASES with Valsalva/standing (less preload \u2192 more outflow obstruction). AS murmur DECREASES with reduced preload, radiates to the carotids, older patient, calcified valve."},
 {sys:"Cardiology",a:"Acute pericarditis",b:"STEMI",correct:"a",stem:"Pleuritic chest pain RELIEVED by sitting forward; ECG: WIDESPREAD saddle-shaped ST elevation + PR depression.",why:"Widespread concave ST elevation + PR depression + positional pleuritic pain = pericarditis. STEMI: REGIONAL ST elevation in a coronary territory with reciprocal change, troponin markedly raised."},
 {sys:"Cardiology",a:"Mitral stenosis",b:"Mitral regurgitation",correct:"a",stem:"Mid-DIASTOLIC rumbling murmur at the apex with a loud S1, prior rheumatic fever.",why:"Mid-diastolic rumble + loud S1 + opening snap = mitral stenosis. MR is a PANSYSTOLIC murmur radiating to the axilla with a soft S1."},
 {sys:"Cardiology",a:"Aortic regurgitation",b:"Aortic stenosis",correct:"a",stem:"Collapsing (water-hammer) pulse + WIDE pulse pressure + early DIASTOLIC murmur at the left sternal edge.",why:"Collapsing pulse + wide pulse pressure + early diastolic murmur = AR. AS: slow-rising pulse, NARROW pulse pressure, ejection SYSTOLIC murmur radiating to carotids."},
 {sys:"Cardiology",a:"Right heart failure",b:"Left heart failure",correct:"a",stem:"Raised JVP + hepatomegaly + ankle oedema + ascites, with CLEAR lung fields.",why:"Peripheral/systemic congestion (raised JVP, oedema, hepatomegaly) = right HF. Left HF: PULMONARY congestion \u2014 orthopnoea, PND, basal crackles."},
 {sys:"Cardiology",a:"Ventricular tachycardia",b:"SVT with aberrancy",correct:"a",stem:"BROAD-complex regular tachycardia in a patient with a PREVIOUS MI.",why:"Broad complex + structural heart disease/prior MI = treat as VT until proven otherwise. SVT with aberrancy is less likely with prior MI; broad-complex tachycardia is VT until disproven."},
 {sys:"Cardiology",a:"Mobitz I (Wenckebach)",b:"Mobitz II",correct:"a",stem:"Progressive PR LENGTHENING beat-to-beat until a QRS is dropped, then the cycle resets.",why:"Progressive PR prolongation then a dropped beat = Mobitz I (usually benign). Mobitz II: CONSTANT PR with sudden dropped beats \u2014 high risk of complete heart block \u2192 pacing."},
 {sys:"Respiratory",a:"COPD",b:"Asthma",correct:"a",stem:"Lifelong smoker >50: progressive dyspnoea with IRREVERSIBLE airflow obstruction, minimal diurnal variation.",why:"Smoker + fixed obstruction + little reversibility = COPD. Asthma: REVERSIBLE obstruction, diurnal/nocturnal variation, atopy, younger onset."},
 {sys:"Respiratory",a:"Atypical pneumonia",b:"Typical pneumonia",correct:"a",stem:"Gradual DRY cough, headache, low-grade fever; CXR looks worse than the examination; cold agglutinins.",why:"Extrapulmonary features + dry cough + CXR\u2013clinical mismatch = atypical (Mycoplasma). Typical (pneumococcal): lobar consolidation, rusty sputum, abrupt high fever."},
 {sys:"Respiratory",a:"Transudate",b:"Exudate",correct:"a",stem:"Pleural fluid protein <25 g/L, bilateral effusions, in a patient with heart failure.",why:"Low protein (Light's criteria not met) from HF/cirrhosis/nephrotic = transudate. Exudate: protein >35 g/L from infection/malignancy/PE."},
 {sys:"Respiratory",a:"Primary spontaneous pneumothorax",b:"Secondary pneumothorax",correct:"a",stem:"TALL THIN young man: sudden pleuritic pain + breathlessness, NO underlying lung disease.",why:"Young, tall, no lung disease = primary spontaneous pneumothorax. Secondary: underlying lung disease (e.g. COPD), older, more dangerous, lower threshold to drain."},
 {sys:"Respiratory",a:"Small cell lung cancer",b:"Non-small cell lung cancer",correct:"a",stem:"CENTRAL tumour in a heavy smoker with SIADH and Cushing's (paraneoplastic) and rapid spread.",why:"Central + paraneoplastic (SIADH/ectopic ACTH) + early metastasis = small cell (chemo, rarely surgical). NSCLC: more often resectable; squamous \u2192 PTHrP hypercalcaemia."},
 {sys:"Respiratory",a:"Bronchiectasis",b:"COPD",correct:"a",stem:"Chronic cough with LARGE volumes of purulent sputum + recurrent infections; tram-track/signet-ring on CT.",why:"Copious purulent sputum + recurrent infection + dilated airways = bronchiectasis. COPD: smoker, less sputum volume, emphysema/airflow limitation."},
 {sys:"Respiratory",a:"Type 1 respiratory failure",b:"Type 2 respiratory failure",correct:"a",stem:"Low PaO2 with a LOW/normal PaCO2 (e.g. PE, pneumonia, pulmonary oedema).",why:"Hypoxia + normal/low CO2 = type 1 (V/Q mismatch). Type 2: hypoxia + HIGH CO2 (ventilatory failure \u2014 COPD, opiates, neuromuscular)."},
 {sys:"Gastro",a:"Gastric ulcer",b:"Duodenal ulcer",correct:"a",stem:"Epigastric pain WORSE with eating + weight loss.",why:"Pain worse on eating (food \u2192 pain) + weight loss = gastric ulcer. Duodenal: pain RELIEVED by eating, worse when hungry/at night, weight stable."},
 {sys:"Gastro",a:"Primary biliary cholangitis",b:"Primary sclerosing cholangitis",correct:"a",stem:"Middle-aged WOMAN: pruritus + fatigue + raised ALP + anti-MITOCHONDRIAL antibody.",why:"Woman + AMA + intrahepatic bile-duct destruction = PBC. PSC: MEN, associated with UC, p-ANCA, 'beaded' ducts on MRCP, cholangiocarcinoma risk."},
 {sys:"Gastro",a:"Haemochromatosis",b:"Wilson's disease",correct:"a",stem:"Middle-aged man: diabetes + BRONZE skin + arthropathy + raised ferritin and transferrin saturation.",why:"Iron overload (bronze diabetes), middle-aged = haemochromatosis. Wilson's: YOUNG, copper overload, Kayser-Fleischer rings, neuropsychiatric signs, LOW caeruloplasmin."},
 {sys:"Gastro",a:"Achalasia",b:"Oesophageal cancer",correct:"a",stem:"Progressive dysphagia to SOLIDS AND LIQUIDS from the start, younger patient, 'bird-beak' on barium.",why:"Dysphagia to solids and liquids equally + bird-beak = achalasia. Cancer: progressive dysphagia SOLIDS THEN liquids, older, weight loss, short history."},
 {sys:"Gastro",a:"Oesophageal varices",b:"Mallory-Weiss tear",correct:"a",stem:"LARGE-volume painless haematemesis in a known alcoholic with stigmata of chronic liver disease.",why:"Large painless bleed + portal hypertension = varices (band ligation + terlipressin). Mallory-Weiss: small bleed AFTER forceful vomiting/retching, usually self-limiting."},
 {sys:"Gastro",a:"Irritable bowel syndrome",b:"Inflammatory bowel disease",correct:"a",stem:"Young woman: pain relieved by defecation + bloating, NORMAL inflammatory markers, NO weight loss or bleeding.",why:"Normal bloods + no red flags + symptoms tied to bowel habit = IBS. IBD: raised CRP/calprotectin, bloody diarrhoea, weight loss, nocturnal symptoms."},
 {sys:"Gastro",a:"Ascending cholangitis",b:"Acute cholecystitis",correct:"a",stem:"Charcot's triad: RUQ pain + fever + JAUNDICE.",why:"Jaundice + fever + RUQ pain (Charcot) = ascending cholangitis (CBD obstruction \u2192 urgent ERCP). Cholecystitis: RUQ pain + fever + Murphy's sign but NO jaundice."},
 {sys:"Gastro",a:"Acute pancreatitis",b:"Chronic pancreatitis",correct:"a",stem:"Sudden SEVERE epigastric pain radiating to the back + amylase/lipase raised >3\u00d7 normal.",why:"Acute severe pain + amylase >3\u00d7 = acute pancreatitis. Chronic: recurrent pain + EXOCRINE insufficiency (steatorrhoea), diabetes, pancreatic calcification; amylase often normal."},
 {sys:"Neurology",a:"Extradural haematoma",b:"Subdural haematoma",correct:"a",stem:"Young man after temporal trauma: LUCID INTERVAL then rapid deterioration; BICONVEX (lens) haematoma on CT.",why:"Lucid interval + biconvex/lens shape (middle meningeal artery) = extradural. Subdural: CRESCENT-shaped, elderly/alcoholic, fluctuating consciousness over days\u2013weeks (bridging veins)."},
 {sys:"Neurology",a:"Ischaemic stroke",b:"Haemorrhagic stroke",correct:"a",stem:"Sudden focal deficit; CT shows a HYPODENSE area in the MCA territory, no blood.",why:"Hypodensity / no blood = ischaemic (thrombolysis if <4.5 h). Haemorrhagic: HYPERDENSE blood on CT \u2014 thrombolysis is CONTRAINDICATED."},
 {sys:"Neurology",a:"Bacterial meningitis",b:"Viral meningitis",correct:"a",stem:"Neck stiffness + fever; CSF: HIGH neutrophils, LOW glucose, HIGH protein, turbid.",why:"Neutrophils + low glucose + high protein = bacterial (urgent ceftriaxone). Viral: LYMPHOCYTES, NORMAL glucose, mildly raised protein, clear CSF."},
 {sys:"Neurology",a:"Bell's palsy (LMN)",b:"Stroke (UMN facial)",correct:"a",stem:"Acute UNILATERAL facial weakness INVOLVING the forehead \u2014 unable to wrinkle the brow.",why:"Forehead INVOLVED = LMN / Bell's palsy. UMN / stroke SPARES the forehead (bilateral cortical innervation) and has other CNS signs."},
 {sys:"Neurology",a:"Alzheimer's disease",b:"Vascular dementia",correct:"a",stem:"Insidious GRADUAL memory decline, smooth progression, no focal neurology.",why:"Gradual smooth decline with early memory loss = Alzheimer's. Vascular: STEPWISE decline, focal neurological signs, vascular risk factors."},
 {sys:"Neurology",a:"Lewy body dementia",b:"Parkinson's disease dementia",correct:"a",stem:"Fluctuating cognition + VISUAL hallucinations + parkinsonism, with dementia BEFORE or within a year of the motor signs.",why:"Dementia within 1 year of (or before) parkinsonism + visual hallucinations + fluctuation = DLB. PDD: established motor Parkinson's for YEARS first, then dementia."},
 {sys:"Neurology",a:"Wernicke's encephalopathy",b:"Korsakoff's syndrome",correct:"a",stem:"Alcoholic: acute CONFUSION + ophthalmoplegia + ataxia, REVERSIBLE with thiamine.",why:"Acute triad + reversible = Wernicke's (give IV thiamine). Korsakoff: CHRONIC irreversible anterograde amnesia + confabulation."},
 {sys:"Neurology",a:"Guillain-Barr\u00e9 syndrome",b:"Myasthenia gravis",correct:"a",stem:"ASCENDING symmetrical weakness + AREFLEXIA days after gastroenteritis; CSF albuminocytological dissociation.",why:"Ascending weakness + areflexia + post-infective + raised CSF protein = GBS. MG: FATIGABLE ocular/bulbar weakness, reflexes preserved, anti-AChR."},
 {sys:"Neurology",a:"Subarachnoid haemorrhage",b:"Migraine",correct:"a",stem:"THUNDERCLAP worst-ever headache peaking in SECONDS + neck stiffness + photophobia.",why:"Thunderclap, instant peak, meningism = SAH (CT then LP for xanthochromia). Migraine: gradual onset over minutes\u2013hours, aura, recurrent stereotyped attacks."},
 {sys:"Endocrine",a:"Diabetic ketoacidosis",b:"Hyperosmolar hyperglycaemic state",correct:"a",stem:"Young T1 diabetic: KETONES, acidosis (pH <7.3), glucose ~20, Kussmaul breathing.",why:"Ketosis + acidosis + younger T1 = DKA. HHS: elderly T2, VERY high glucose (>30), profound dehydration, high osmolality, NO significant ketones/acidosis."},
 {sys:"Endocrine",a:"Cushing's disease",b:"Cushing's syndrome",correct:"a",stem:"ACTH-dependent cortisol excess arising from a PITUITARY adenoma.",why:"Cushing's DISEASE specifically = a pituitary ACTH-secreting adenoma. SYNDROME = ANY cause of cortisol excess (exogenous steroids, adrenal tumour, ectopic ACTH)."},
 {sys:"Endocrine",a:"Conn's syndrome",b:"Phaeochromocytoma",correct:"a",stem:"Resistant hypertension + HYPOKALAEMIA + metabolic alkalosis; high aldosterone, low renin.",why:"Hypertension + hypokalaemia + high aldosterone:renin = Conn's (primary hyperaldosteronism). Phaeo: EPISODIC headache/sweating/palpitations, raised plasma metanephrines."},
 {sys:"Endocrine",a:"Central diabetes insipidus",b:"Nephrogenic diabetes insipidus",correct:"a",stem:"Polyuria with dilute urine; urine CONCENTRATES after desmopressin.",why:"Responds to desmopressin = CENTRAL (ADH deficiency). Nephrogenic: NO response to desmopressin (renal resistance \u2014 lithium, hypercalcaemia)."},
 {sys:"Endocrine",a:"Acromegaly",b:"Gigantism",correct:"a",stem:"Adult: enlarging hands/feet, coarse features, sweating; GH excess AFTER the growth plates have fused.",why:"GH excess in adults (fused epiphyses) = acromegaly. Gigantism: GH excess in CHILDREN before epiphyseal fusion \u2192 very tall stature."},
 {sys:"Endocrine",a:"Hypocalcaemia",b:"Hypercalcaemia",correct:"a",stem:"Perioral tingling + carpopedal spasm + positive Trousseau's and Chvostek's signs.",why:"Tetany / Chvostek / Trousseau = hypocalcaemia. Hypercalcaemia: 'stones, bones, groans, moans' \u2014 polyuria, constipation, confusion, short QT."},
 {sys:"Nephrology",a:"Minimal change disease",b:"Focal segmental glomerulosclerosis",correct:"a",stem:"CHILD with nephrotic syndrome, normal light microscopy, RESPONDS to steroids.",why:"Child + steroid-responsive + normal light microscopy (foot-process effacement on EM) = minimal change. FSGS: segmental scarring, often steroid-RESISTANT, adults/Afro-Caribbean, HIV."},
 {sys:"Nephrology",a:"IgA nephropathy",b:"Post-streptococcal glomerulonephritis",correct:"a",stem:"Visible haematuria 1\u20132 DAYS after a URTI, young adult, NORMAL complement.",why:"Haematuria DAYS after a URTI + normal complement = IgA (Berger's). Post-strep: 1\u20132 WEEKS after throat/skin infection, LOW C3, raised ASO, child."},
 {sys:"Nephrology",a:"Thrombotic thrombocytopenic purpura",b:"Haemolytic uraemic syndrome",correct:"a",stem:"Adult: MAHA + thrombocytopenia + FEVER + NEUROLOGICAL signs + renal impairment.",why:"Neuro signs + fever predominate (ADAMTS13 deficiency) = TTP. HUS: CHILD after E. coli O157 diarrhoea, RENAL failure dominates, fewer neurological signs."},
 {sys:"Haematology",a:"Iron-deficiency anaemia",b:"Anaemia of chronic disease",correct:"a",stem:"Microcytic anaemia: LOW ferritin, HIGH TIBC, low transferrin saturation.",why:"Low ferritin + high TIBC = iron deficiency. ACD: ferritin NORMAL/HIGH, TIBC LOW (iron trapped by inflammation)."},
 {sys:"Haematology",a:"Vitamin B12 deficiency",b:"Folate deficiency",correct:"a",stem:"Macrocytic anaemia + peripheral NEUROPATHY / subacute combined degeneration of the cord.",why:"Neurological signs = B12 deficiency (replace B12 FIRST). Folate deficiency: macrocytic anaemia WITHOUT neuro signs \u2014 giving folate alone in B12 deficiency worsens the neuropathy."},
 {sys:"Haematology",a:"Haemophilia",b:"von Willebrand disease",correct:"a",stem:"Male child: HAEMARTHROSIS + deep muscle bleeds, prolonged APTT, normal platelets.",why:"Deep joint/muscle bleeds + X-linked male + isolated long APTT = haemophilia. vWD: MUCOCUTANEOUS bleeding (epistaxis, menorrhagia), autosomal, defective platelet adhesion."},
 {sys:"Haematology",a:"Acute lymphoblastic leukaemia",b:"Acute myeloid leukaemia",correct:"a",stem:"CHILD with pancytopenia, lymphadenopathy and blasts; the commonest childhood malignancy.",why:"Child + lymphoblasts = ALL (commonest childhood cancer). AML: ADULTS, Auer rods, myeloblasts."},
 {sys:"Haematology",a:"Chronic lymphocytic leukaemia",b:"Chronic myeloid leukaemia",correct:"a",stem:"Elderly, asymptomatic LYMPHOCYTOSIS with SMUDGE cells on the film.",why:"Mature lymphocytosis + smudge cells + elderly = CLL. CML: massive splenomegaly, Philadelphia chromosome (BCR-ABL), neutrophilia across the myeloid spectrum."},
 {sys:"Haematology",a:"Sickle cell disease",b:"Beta-thalassaemia major",correct:"a",stem:"Afro-Caribbean child: recurrent vaso-occlusive PAIN crises; HbS on electrophoresis.",why:"Vaso-occlusive crises + HbS = sickle cell. Thalassaemia major: transfusion-dependent from infancy, HbA absent/HbF high, skull bossing, iron overload."},
 {sys:"Rheumatology",a:"Systemic lupus erythematosus",b:"Rheumatoid arthritis",correct:"a",stem:"Young woman: malar rash, photosensitivity, NON-erosive arthritis, ANA and anti-dsDNA positive.",why:"Multisystem + anti-dsDNA + non-erosive arthritis = SLE. RA: EROSIVE symmetrical small-joint arthritis, anti-CCP/RF, no malar rash."},
 {sys:"Rheumatology",a:"Septic arthritis",b:"Reactive arthritis",correct:"a",stem:"Single HOT swollen joint; aspirate shows high WCC WITH ORGANISMS; systemically unwell.",why:"Organisms on aspirate + systemic sepsis = septic arthritis (emergency washout + antibiotics). Reactive: STERILE arthritis days\u2013weeks after GI/GU infection ('can't see, can't pee, can't climb a tree')."},
 {sys:"Rheumatology",a:"Polymyalgia rheumatica",b:"Polymyositis",correct:"a",stem:"Over-50: proximal pain and STIFFNESS (not true weakness), high ESR, NORMAL CK, dramatic steroid response.",why:"Stiffness + normal CK + raised ESR = PMR. Polymyositis: proximal WEAKNESS + RAISED CK + EMG/biopsy changes."},
 {sys:"Rheumatology",a:"Ankylosing spondylitis",b:"Mechanical back pain",correct:"a",stem:"Young man: insidious back pain BETTER with exercise, WORSE with rest/at night, morning stiffness, HLA-B27.",why:"Inflammatory pattern (better with activity, night pain, prolonged morning stiffness) + HLA-B27 = AS. Mechanical: worse with activity, better with rest, no systemic features."},
 {sys:"Rheumatology",a:"Giant cell arteritis",b:"Migraine",correct:"a",stem:"Over-50: new TEMPORAL headache + JAW CLAUDICATION + scalp tenderness + raised ESR + transient visual loss.",why:"Age >50 + jaw claudication + raised ESR + amaurosis = GCA (urgent high-dose steroids BEFORE biopsy). Migraine: younger, recurrent, normal ESR, no jaw claudication."},
 {sys:"Dermatology",a:"Psoriasis",b:"Eczema",correct:"a",stem:"Well-demarcated SALMON-pink plaques with SILVERY scale on EXTENSOR surfaces + nail pitting.",why:"Extensor distribution, silvery scale, well-demarcated, nail pits = psoriasis. Eczema: ITCHY, ill-defined, FLEXURAL, weeping or lichenified."},
 {sys:"Dermatology",a:"Basal cell carcinoma",b:"Squamous cell carcinoma",correct:"a",stem:"Slow-growing PEARLY papule with a rolled edge + telangiectasia; rarely metastasises.",why:"Pearly rolled edge + telangiectasia + indolent = BCC. SCC: keratotic/ulcerated, faster-growing, can metastasise, arises in actinic keratosis."},
 {sys:"Dermatology",a:"Malignant melanoma",b:"Seborrhoeic keratosis",correct:"a",stem:"CHANGING pigmented lesion: asymmetry, irregular border, colour variation, diameter >6 mm.",why:"ABCDE changes = melanoma (urgent excision). Seborrhoeic keratosis: benign 'stuck-on' warty plaque with no ABCDE features."},
 {sys:"Dermatology",a:"Stevens-Johnson syndrome / TEN",b:"Erythema multiforme",correct:"a",stem:"MUCOSAL involvement + skin detachment + systemic illness after starting a drug.",why:"Drug trigger + mucosal involvement + epidermal detachment + systemic upset = SJS/TEN (emergency, stop the drug). EM: TARGET lesions, usually post-HSV, milder, limited mucosal involvement."},
 {sys:"Dermatology",a:"Cellulitis",b:"Deep vein thrombosis",correct:"a",stem:"Unilateral red, swollen, warm calf WITH fever, spreading erythema and a skin break.",why:"Skin break + fever + spreading erythema = cellulitis. DVT: calf swelling/tenderness WITHOUT skin infection, with thrombosis risk factors, confirmed on Doppler."},
 {sys:"Psychiatry",a:"Serotonin syndrome",b:"Neuroleptic malignant syndrome",correct:"a",stem:"After an SSRI: HYPERreflexia + CLONUS + agitation, onset within HOURS.",why:"Hyperreflexia + clonus + rapid onset after a serotonergic drug = serotonin syndrome. NMS: ANTIPSYCHOTIC trigger, 'lead-pipe' RIGIDITY, HYPOreflexia, slower onset (days), very high CK."},
 {sys:"Psychiatry",a:"Anorexia nervosa",b:"Bulimia nervosa",correct:"a",stem:"Markedly LOW BMI (<17.5), amenorrhoea, intense fear of weight gain, dietary restriction.",why:"Markedly low weight + restriction = anorexia. Bulimia: usually NORMAL weight, binge\u2013purge cycles, parotid swelling, Russell's sign, hypokalaemia."},
 {sys:"Psychiatry",a:"Bipolar affective disorder",b:"Borderline personality disorder",correct:"a",stem:"Distinct episodes of elevated mood lasting DAYS\u2013WEEKS with reduced need for sleep, between periods of normal mood.",why:"Sustained discrete mood EPISODES (days\u2013weeks) = bipolar. BPD: rapid mood shifts within HOURS, chronic instability, fear of abandonment, self-harm."},
 {sys:"Psychiatry",a:"Post-traumatic stress disorder",b:"Acute stress disorder",correct:"a",stem:"Flashbacks, hypervigilance and avoidance persisting BEYOND one month after the trauma.",why:"Symptoms lasting >1 month = PTSD. Acute stress disorder: the same symptoms but within the FIRST month (3 days\u20134 weeks) after trauma."},
 {sys:"Psychiatry",a:"Delirium",b:"Dementia",correct:"a",stem:"ACUTE fluctuating confusion + INATTENTION + altered consciousness, often with an infection.",why:"Acute onset + fluctuation + inattention + a reversible trigger = delirium. Dementia: chronic, progressive, with CLEAR consciousness until late."},
 {sys:"Psychiatry",a:"Obsessive-compulsive disorder",b:"Obsessive-compulsive personality disorder",correct:"a",stem:"Intrusive UNWANTED thoughts causing distress, relieved by compulsive rituals the patient regards as EXCESSIVE.",why:"Ego-DYSTONIC obsessions + compulsions = OCD (responds to SSRI/CBT). OCPD: ego-SYNTONIC lifelong perfectionism and rigidity, no true obsessions \u2014 a personality trait."},
 {sys:"Obs & Gynae",a:"Placental abruption",b:"Placenta praevia",correct:"a",stem:"PAINFUL vaginal bleeding + a TENDER, woody-hard uterus + fetal distress.",why:"Pain + a tense tender uterus \u00b1 concealed bleed = abruption. Praevia: PAINLESS bleeding, soft non-tender uterus, low-lying placenta."},
 {sys:"Obs & Gynae",a:"Ectopic pregnancy",b:"Miscarriage",correct:"a",stem:"6 weeks amenorrhoea + UNILATERAL pelvic pain + shoulder-tip pain + positive \u03b2hCG with an EMPTY uterus on scan.",why:"Unilateral pain + shoulder-tip pain + empty uterus with positive \u03b2hCG = ectopic (emergency). Miscarriage: intrauterine pregnancy, central crampy pain, products at the os."},
 {sys:"Obs & Gynae",a:"Endometriosis",b:"Adenomyosis",correct:"a",stem:"Cyclical pelvic pain + deep DYSPAREUNIA + subfertility in a nulliparous woman; chocolate cysts, normal-size uterus.",why:"Deep dyspareunia + subfertility + chocolate cysts = endometriosis (tissue OUTSIDE the uterus). Adenomyosis: BULKY tender uterus, menorrhagia, multiparous, tissue WITHIN the myometrium."},
 {sys:"Obs & Gynae",a:"Pre-eclampsia",b:"Gestational hypertension",correct:"a",stem:"After 20 weeks: new hypertension WITH significant PROTEINURIA.",why:"Hypertension + proteinuria (or end-organ dysfunction) after 20 weeks = pre-eclampsia. Gestational hypertension: new hypertension WITHOUT proteinuria or end-organ features."},
 {sys:"Obs & Gynae",a:"Molar pregnancy",b:"Hyperemesis gravidarum",correct:"a",stem:"Severe vomiting + uterus LARGE for dates + very HIGH \u03b2hCG + 'snowstorm' appearance on ultrasound.",why:"Snowstorm + very high \u03b2hCG + large-for-dates = molar pregnancy. Hyperemesis: severe vomiting with ketosis/weight loss but a NORMAL scan (though molar/multiple pregnancy raise hCG and can trigger it)."},
 {sys:"Paediatrics",a:"Croup",b:"Epiglottitis",correct:"a",stem:"BARKING cough + stridor + hoarse voice, child still drinking, gradual viral onset.",why:"Barking cough + hoarse voice + gradual onset = croup (parainfluenza; oral dexamethasone). Epiglottitis: DROOLING, TRIPOD posture, toxic, muffled voice, NO cough \u2014 do NOT examine the throat (Hib)."},
 {sys:"Paediatrics",a:"Measles",b:"Rubella",correct:"a",stem:"Fever + cough/coryza/conjunctivitis + KOPLIK spots, then a descending maculopapular rash.",why:"The three C's + Koplik spots = measles. Rubella: milder, post-auricular lymphadenopathy, fainter rash, teratogenic in early pregnancy."},
 {sys:"Paediatrics",a:"Febrile seizure",b:"Epilepsy",correct:"a",stem:"Brief GENERALISED seizure DURING a fever in a child aged 6 months\u20135 years, otherwise normal development.",why:"With fever + age 6 mo\u20135 yr + brief + normal child = simple febrile seizure (benign). Epilepsy: UNPROVOKED recurrent seizures without fever."},
 {sys:"Paediatrics",a:"Slipped capital femoral epiphysis",b:"Perthes disease",correct:"a",stem:"OBESE adolescent boy: hip/knee pain + an externally rotated leg + limp.",why:"Adolescent + obese + externally rotated leg = SUFE (surgical pinning). Perthes: 4\u20138-year-old, avascular necrosis of the femoral head, younger child."},
 {sys:"Paediatrics",a:"Atrial septal defect",b:"Ventricular septal defect",correct:"a",stem:"Asymptomatic child: FIXED SPLIT second heart sound + a pulmonary flow murmur.",why:"Fixed splitting of S2 = ASD. VSD: harsh PANSYSTOLIC murmur at the left sternal edge \u2014 the commonest congenital heart defect."},
 {sys:"Surgery",a:"Small bowel obstruction",b:"Large bowel obstruction",correct:"a",stem:"Vomiting EARLY + central colicky pain + 'ladder' valvulae conniventes crossing the full bowel width centrally.",why:"Early vomiting + central distension + valvulae conniventes (crossing fully) = SBO (adhesions, hernia). LBO: distension first, late vomiting, peripheral haustra, cancer/volvulus."},
 {sys:"Surgery",a:"Diverticulitis",b:"Colorectal cancer",correct:"a",stem:"Acute LEFT iliac fossa pain + fever + raised CRP in an older patient with known diverticula.",why:"Acute LIF pain + fever + inflammation = diverticulitis. Colorectal cancer: insidious change in bowel habit, weight loss, iron-deficiency anaemia, PR bleeding."},
 {sys:"Surgery",a:"Testicular torsion",b:"Epididymo-orchitis",correct:"a",stem:"SUDDEN severe testicular pain, HIGH-riding testis, ABSENT cremasteric reflex, age 13.",why:"Sudden onset + high-riding testis + absent cremasteric reflex + young = torsion (surgery within 6 h). Epididymo-orchitis: gradual, fever/dysuria, relief on elevation (Prehn's positive), older."},
 {sys:"Surgery",a:"Indirect inguinal hernia",b:"Direct inguinal hernia",correct:"a",stem:"Hernia emerging through the deep ring LATERAL to the inferior epigastric vessels, controlled by pressure over the deep ring.",why:"Lateral to the epigastric vessels, through the deep ring, controlled by deep-ring pressure = indirect (commonest). Direct: MEDIAL to the vessels, through Hesselbach's triangle, NOT controlled by deep-ring pressure."},
 {sys:"Surgery",a:"Ruptured abdominal aortic aneurysm",b:"Renal colic",correct:"a",stem:"Older smoker: sudden flank/back pain + HYPOTENSION + a pulsatile expansile abdominal mass.",why:"Pulsatile expansile mass + hypotension + older smoker = ruptured AAA (do NOT delay for imaging if unstable). Renal colic: loin-to-groin colicky pain, haematuria, haemodynamically stable."},
 {sys:"Surgery",a:"Sigmoid volvulus",b:"Caecal volvulus",correct:"a",stem:"Elderly constipated patient: a 'COFFEE-BEAN' loop arising from the pelvis and pointing to the RUQ.",why:"Coffee-bean loop arising from the pelvis = sigmoid volvulus (commonest; decompress with a flatus tube). Caecal: younger patient, right-sided, usually needs surgery."},
 {sys:"Ophthalmology",a:"Anterior uveitis",b:"Conjunctivitis",correct:"a",stem:"Painful red eye + PHOTOPHOBIA + small irregular pupil + ciliary flush; vision affected.",why:"Pain + photophobia + ciliary flush + miosis = anterior uveitis (HLA-B27 link). Conjunctivitis: gritty, discharge, NORMAL pupil and vision, no true photophobia."},
 {sys:"Ophthalmology",a:"Acute angle-closure glaucoma",b:"Anterior uveitis",correct:"a",stem:"Sudden painful red eye + HALOS round lights + fixed MID-DILATED pupil + rock-hard eye + vomiting.",why:"Mid-dilated fixed pupil + hard globe + halos = acute angle-closure glaucoma (emergency). Uveitis: SMALL pupil, normal/soft globe, photophobia from ciliary spasm."},
 {sys:"Ophthalmology",a:"Central retinal artery occlusion",b:"Central retinal vein occlusion",correct:"a",stem:"Sudden PAINLESS monocular vision loss; pale retina with a CHERRY-RED spot.",why:"Pale retina + cherry-red spot + 'curtain' = CRAO (stroke of the eye). CRVO: 'blood-and-thunder' fundus \u2014 dilated tortuous veins + widespread haemorrhages."},
 {sys:"Ophthalmology",a:"Wet age-related macular degeneration",b:"Dry age-related macular degeneration",correct:"a",stem:"Elderly: RAPID central vision loss + straight lines look wavy (metamorphopsia); choroidal neovascular membrane.",why:"Rapid distortion + neovascularisation = wet AMD (anti-VEGF injections). Dry AMD: GRADUAL central loss, drusen, no neovascular membrane."},
 {sys:"Ophthalmology",a:"Papilloedema",b:"Optic neuritis",correct:"a",stem:"BILATERAL disc swelling + headache + enlarged blind spot, with acuity preserved early.",why:"Bilateral swelling + raised-ICP features + preserved acuity = papilloedema. Optic neuritis: UNILATERAL, PAIN on eye movement, reduced acuity + RAPD + central scotoma (MS link)."},
 {sys:"Ophthalmology",a:"Hyphaema",b:"Hypopyon",correct:"a",stem:"Layered BLOOD in the anterior chamber after blunt eye trauma.",why:"Blood in the anterior chamber = hyphaema (trauma). Hypopyon: layered PUS/white cells from infection or severe uveitis (endophthalmitis, Beh\u00e7et's)."},
 {sys:"Ophthalmology",a:"Bacterial conjunctivitis",b:"Viral conjunctivitis",correct:"a",stem:"Red eye with PURULENT discharge and lids stuck together in the morning.",why:"Purulent sticky discharge = bacterial. Viral: WATERY discharge, follicles, pre-auricular node, recent URTI, often becomes bilateral."},
 {sys:"ENT",a:"Otitis media",b:"Otitis externa",correct:"a",stem:"Child with deep ear pain + fever + a BULGING red tympanic membrane after a URTI.",why:"Bulging drum + fever post-URTI = acute otitis media. Otitis externa: pain on moving the TRAGUS/pinna, canal swelling/discharge, swimmers, drum normal."},
 {sys:"ENT",a:"M\u00e9ni\u00e8re's disease",b:"Benign paroxysmal positional vertigo",correct:"a",stem:"Recurrent VERTIGO lasting HOURS + tinnitus + fluctuating hearing loss + aural fullness.",why:"Vertigo for hours + tinnitus + hearing loss + fullness = M\u00e9ni\u00e8re's. BPPV: BRIEF seconds of vertigo on head-turning, NO hearing loss/tinnitus, positive Dix-Hallpike."},
 {sys:"ENT",a:"Vestibular neuritis",b:"Labyrinthitis",correct:"a",stem:"Acute sustained vertigo for days after a viral illness, with hearing INTACT.",why:"Vertigo WITHOUT hearing loss = vestibular neuritis. Labyrinthitis: vertigo WITH hearing loss \u00b1 tinnitus (labyrinth involves the cochlea)."},
 {sys:"ENT",a:"Conductive hearing loss",b:"Sensorineural hearing loss",correct:"a",stem:"Weber lateralises to the AFFECTED ear; Rinne negative (bone > air) on that side.",why:"Weber to the bad ear + Rinne negative = conductive (wax, effusion, otosclerosis). SNHL: Weber to the GOOD ear, Rinne positive (air > bone)."},
 {sys:"ENT",a:"Peritonsillar abscess (quinsy)",b:"Tonsillitis",correct:"a",stem:"Severe UNILATERAL throat pain + TRISMUS + 'hot-potato' voice + uvula deviated away.",why:"Trismus + uvular deviation + unilateral bulge = quinsy (needs aspiration/drainage). Tonsillitis: bilateral, no trismus or uvular shift."},
 {sys:"ENT",a:"Anterior epistaxis",b:"Posterior epistaxis",correct:"a",stem:"Nosebleed from Little's area (Kiesselbach plexus), controlled by pinching the soft nose.",why:"Little's area, younger patient, responds to pinching/cautery = anterior. Posterior: profuse, older/hypertensive, bleeds back into the pharynx, may need packing/balloon."},
 {sys:"Surgery",a:"Acute mesenteric ischaemia",b:"Diverticulitis",correct:"a",stem:"Elderly AF patient: SEVERE central abdominal pain OUT OF PROPORTION to a soft abdomen + raised lactate.",why:"Pain out of proportion + embolic source (AF) + lactataemia = acute mesenteric ischaemia (emergency laparotomy). Diverticulitis: localised LIF pain + fever + focal tenderness."},
 {sys:"Surgery",a:"Femoral hernia",b:"Inguinal hernia",correct:"a",stem:"Groin lump BELOW and lateral to the pubic tubercle, in a woman, with high strangulation risk.",why:"Below & lateral to the pubic tubercle = femoral (women; strangulates \u2014 repair promptly). Inguinal hernia: ABOVE & medial to the pubic tubercle."},
 {sys:"Surgery",a:"Strangulated hernia",b:"Incarcerated hernia",correct:"a",stem:"Irreducible TENDER hernia with overlying erythema + systemic toxicity + signs of ischaemia.",why:"Ischaemia + toxicity = strangulated (surgical emergency). Incarcerated: irreducible but NOT ischaemic \u2014 non-tender, no toxicity."},
 {sys:"Surgery",a:"Gallstone ileus",b:"Simple small bowel obstruction",correct:"a",stem:"Elderly: small bowel obstruction + AIR in the biliary tree (pneumobilia) + an ectopic gallstone in the RIF.",why:"Rigler triad (SBO + pneumobilia + ectopic gallstone) = gallstone ileus. Simple SBO: adhesions/hernia, no pneumobilia."},
 {sys:"Surgery",a:"Ogilvie syndrome (pseudo-obstruction)",b:"Mechanical large bowel obstruction",correct:"a",stem:"Massive colonic dilatation with NO mechanical cause, in a frail/post-op or elderly patient.",why:"No transition point / no mechanical lesion = acute colonic pseudo-obstruction (Ogilvie). Mechanical LBO: a clear transition point (tumour, volvulus, stricture)."},
 {sys:"Surgery",a:"Perianal abscess",b:"Anal fissure",correct:"a",stem:"Throbbing perianal pain + a tender FLUCTUANT swelling + fever.",why:"Fluctuant tender swelling + fever = perianal abscess (incision & drainage). Fissure: SHARP pain on defecation + bright PR bleeding + a posterior-midline tear, no swelling."},
 {sys:"Surgery",a:"Pilonidal abscess",b:"Perianal abscess",correct:"a",stem:"Painful swelling in the NATAL CLEFT with a hair-containing sinus.",why:"Natal cleft + hair-laden sinus = pilonidal. Perianal abscess: sits at the anal margin, related to anal glands."},
 {sys:"Cardiology",a:"Prinzmetal (variant) angina",b:"Stable angina",correct:"a",stem:"Chest pain at REST, often at night, with TRANSIENT ST elevation that fully resolves; coronary spasm.",why:"Rest pain + transient ST elevation + spasm (young, smokers) = Prinzmetal (calcium-channel blockers). Stable angina: EXERTIONAL, relieved by rest/GTN, fixed stenosis."},
 {sys:"Cardiology",a:"Infective endocarditis",b:"Acute rheumatic fever",correct:"a",stem:"Fever + new murmur + Janeway lesions/Osler nodes + splinter haemorrhages; positive blood cultures.",why:"Emboli + positive cultures + vegetations = IE (Duke criteria). Rheumatic fever: post-strep, JONES criteria \u2014 migratory polyarthritis, carditis, chorea, erythema marginatum."},
 {sys:"Cardiology",a:"Dilated cardiomyopathy",b:"Hypertrophic cardiomyopathy",correct:"a",stem:"Young patient: heart failure + S3 gallop + a globally DILATED, poorly contracting ventricle.",why:"Dilated, systolic failure (alcohol, viral) = DCM. HCM: asymmetric septal HYPERTROPHY, outflow obstruction, syncope and sudden death in athletes."},
 {sys:"Cardiology",a:"NSTEMI",b:"Unstable angina",correct:"a",stem:"Cardiac-sounding rest pain + ST depression, and the troponin is RAISED.",why:"Positive troponin = NSTEMI (subendocardial infarct). Unstable angina: identical presentation but troponin NORMAL (ischaemia without necrosis)."},
 {sys:"Respiratory",a:"Pulmonary embolism",b:"Pneumonia",correct:"a",stem:"Sudden pleuritic pain + dyspnoea + haemoptysis with CLEAR lungs + hypoxia, after immobility/surgery.",why:"Sudden + clear lungs + hypoxia + risk factors = PE (Wells score, CTPA). Pneumonia: fever, productive cough, focal crackles/consolidation, CXR infiltrate."},
 {sys:"Respiratory",a:"Anaphylaxis",b:"Acute asthma",correct:"a",stem:"Acute wheeze + stridor + URTICARIA + angioedema + HYPOTENSION minutes after a bee sting.",why:"Urticaria/angioedema + hypotension + a trigger = anaphylaxis (IM adrenaline). Asthma: wheeze and dyspnoea WITHOUT urticaria, angioedema or hypotension."},
 {sys:"Respiratory",a:"Mesothelioma",b:"Bronchogenic carcinoma",correct:"a",stem:"Pleural thickening + effusion in a former ASBESTOS/shipyard worker decades later.",why:"Asbestos + pleural rind/effusion = mesothelioma. Bronchogenic carcinoma: a parenchymal mass, smoking-related, may cavitate."},
 {sys:"Respiratory",a:"Aspiration pneumonia",b:"Community-acquired pneumonia",correct:"a",stem:"Right LOWER-lobe consolidation in a stroke/reduced-GCS patient with swallowing difficulty.",why:"Dependent (right lower lobe) + aspiration risk (stroke, alcohol, reduced GCS) = aspiration pneumonia (anaerobes). CAP: typical organisms, no aspiration risk."},
 {sys:"Respiratory",a:"Idiopathic pulmonary fibrosis",b:"COPD",correct:"a",stem:"Progressive dyspnoea + DRY cough + fine end-inspiratory CRACKLES + clubbing; RESTRICTIVE spirometry.",why:"Fine crackles + clubbing + restrictive pattern = IPF. COPD: OBSTRUCTIVE, smoker, wheeze, hyperinflation, no clubbing."},
 {sys:"Gastro",a:"Clostridioides difficile colitis",b:"Ulcerative colitis",correct:"a",stem:"Profuse watery diarrhoea after broad-spectrum ANTIBIOTICS; pseudomembranes on sigmoidoscopy.",why:"Recent antibiotics + toxin + pseudomembranes = C. difficile (oral vancomycin). UC: chronic relapsing BLOODY diarrhoea, no antibiotic trigger, continuous from rectum."},
 {sys:"Gastro",a:"Boerhaave syndrome",b:"Mallory-Weiss tear",correct:"a",stem:"FULL-THICKNESS oesophageal rupture after violent vomiting + chest pain + surgical emphysema + shock.",why:"Transmural rupture + mediastinitis/surgical emphysema + shock = Boerhaave (surgical emergency). Mallory-Weiss: a MUCOSAL tear \u2192 haematemesis, usually self-limiting."},
 {sys:"Gastro",a:"Zollinger-Ellison syndrome",b:"Typical peptic ulcer disease",correct:"a",stem:"Multiple/recurrent refractory ulcers + diarrhoea + a very high fasting GASTRIN.",why:"Multiple refractory ulcers + high gastrin (gastrinoma) = Zollinger-Ellison. Typical PUD: H. pylori/NSAIDs, single ulcer, normal gastrin."},
 {sys:"Gastro",a:"Pancreatic cancer",b:"Chronic pancreatitis",correct:"a",stem:"PAINLESS obstructive jaundice + weight loss + a palpable non-tender gallbladder (Courvoisier) in an elderly smoker.",why:"Painless jaundice + Courvoisier sign + weight loss = pancreatic head cancer. Chronic pancreatitis: PAINFUL, alcohol, calcification, exocrine failure (steatorrhoea)."},
 {sys:"Neurology",a:"Medication-overuse headache",b:"Tension-type headache",correct:"a",stem:"Daily bilateral pressure headache in a patient using analgesics on >15 days per month.",why:"Frequent analgesic use + daily headache = medication-overuse headache (withdraw the analgesic). Tension-type: episodic band-like headache, not analgesic-driven."},
 {sys:"Neurology",a:"Absence seizure",b:"Complex partial (focal) seizure",correct:"a",stem:"Child with brief BLANK staring spells + eyelid flutter, instant recovery; 3-Hz spike-and-wave.",why:"Brief, no aura, NO post-ictal phase, 3-Hz spike-wave = absence. Complex partial: an aura + automatisms (lip-smacking) + POST-ICTAL confusion."},
 {sys:"Neurology",a:"Horner's syndrome",b:"Third nerve palsy",correct:"a",stem:"Partial ptosis + MIOSIS + anhidrosis, with the eye normally aligned.",why:"Ptosis + small pupil (miosis) + anhidrosis = Horner's (sympathetic lesion). CN III palsy: ptosis + a 'down-and-out' eye + a DILATED pupil (if surgical/compressive)."},
 {sys:"Neurology",a:"Cauda equina syndrome",b:"Conus medullaris syndrome",correct:"a",stem:"Bilateral sciatica + SADDLE anaesthesia + urinary retention + reduced anal tone.",why:"Asymmetric LMN signs + saddle anaesthesia + retention = cauda equina (urgent MRI + decompression). Conus medullaris: earlier symmetric mixed UMN+LMN signs, less radicular pain."},
 {sys:"Neurology",a:"Carpal tunnel syndrome",b:"Cubital tunnel syndrome",correct:"a",stem:"Night-time numbness of the THUMB, index and middle fingers + thenar wasting.",why:"Median nerve territory (radial 3.5 digits) + thenar wasting = carpal tunnel. Cubital tunnel: ULNAR nerve \u2014 little/ring finger numbness, hypothenar/interosseous wasting."},
 {sys:"Neurology",a:"Ramsay Hunt syndrome",b:"Bell's palsy",correct:"a",stem:"LMN facial palsy + PAINFUL vesicles in the ear canal + hearing loss/vertigo.",why:"Vesicles in the ear + facial palsy = Ramsay Hunt (VZV; aciclovir + steroids). Bell's palsy: idiopathic LMN facial weakness, NO vesicles."},
 {sys:"Endocrine",a:"Thyroid storm",b:"Uncomplicated thyrotoxicosis",correct:"a",stem:"Fever + tachyarrhythmia + agitation/delirium + heart failure in a hyperthyroid patient after infection/surgery.",why:"Hyperpyrexia + arrhythmia + CNS/CVS decompensation = thyroid storm (emergency: propranolol, PTU, iodine, steroids). Simple thyrotoxicosis: hypermetabolic but compensated."},
 {sys:"Endocrine",a:"Subclinical hypothyroidism",b:"Overt hypothyroidism",correct:"a",stem:"RAISED TSH with a NORMAL free T4 and minimal symptoms.",why:"High TSH + normal T4 = subclinical (treat if symptomatic, pregnant, or TSH >10). Overt: high TSH + LOW T4 + clinical features."},
 {sys:"Endocrine",a:"SIADH",b:"Cerebral salt wasting",correct:"a",stem:"Hyponatraemia + concentrated urine + EUVOLAEMIA + low plasma osmolality.",why:"Euvolaemic hyponatraemia with concentrated urine = SIADH (fluid restrict). Cerebral salt wasting: HYPOVOLAEMIC (dehydrated) hyponatraemia after brain injury \u2014 treat with salt and fluids."},
 {sys:"Endocrine",a:"Phaeochromocytoma",b:"Panic disorder",correct:"a",stem:"Episodic headache + palpitations + sweating + PAROXYSMAL hypertension; raised plasma metanephrines.",why:"Paroxysmal hypertension + raised metanephrines = phaeochromocytoma. Panic disorder: identical autonomic symptoms but NORMAL BP and metanephrines, situational triggers."},
 {sys:"Nephrology",a:"Acute interstitial nephritis",b:"Acute tubular necrosis",correct:"a",stem:"AKI + rash + EOSINOPHILIA + white-cell casts days after a new drug (NSAID/antibiotic).",why:"Drug + rash + eosinophils + WBC casts = acute interstitial nephritis (stop the drug). ATN: MUDDY-BROWN granular casts, ischaemic/toxic, no rash or eosinophilia."},
 {sys:"Urology",a:"Renal cell carcinoma",b:"Bladder cancer",correct:"a",stem:"PAINLESS haematuria + a flank mass + paraneoplastic features (polycythaemia/hypercalcaemia) in a smoker.",why:"Flank mass + paraneoplastic syndrome + haematuria = RCC. Bladder cancer: painless haematuria with irritative LUTS, smoking/aniline-dye link, diagnosed at cystoscopy."},
 {sys:"Urology",a:"Benign prostatic hyperplasia",b:"Prostate cancer",correct:"a",stem:"Gradual LUTS + a SMOOTHLY enlarged prostate + only mildly raised PSA, no hard nodule.",why:"Smooth symmetrical enlargement = BPH. Prostate cancer: a HARD, irregular nodule, markedly raised PSA, possible bone pain/metastases."},
 {sys:"Urology",a:"Acute urinary retention",b:"Chronic urinary retention",correct:"a",stem:"Sudden PAINFUL inability to void with a tender, palpable bladder.",why:"Painful + sudden = acute retention (catheterise now). Chronic retention: PAINLESS large residual volume, overflow incontinence, can cause obstructive nephropathy."},
 {sys:"Urology",a:"Hydrocele",b:"Varicocele",correct:"a",stem:"Painless scrotal swelling that TRANSILLUMINATES, and you can get above it.",why:"Transilluminates + you can get above it = hydrocele. Varicocele: a non-transilluminating 'bag of worms', usually LEFT-sided, may impair fertility."},
 {sys:"Haematology",a:"Polycythaemia vera",b:"Secondary polycythaemia",correct:"a",stem:"Raised haematocrit + pruritus after hot baths + splenomegaly + JAK2 mutation, with LOW EPO.",why:"JAK2 + low EPO + splenomegaly/aquagenic pruritus = polycythaemia vera (venesection, aspirin). Secondary: HIGH EPO (hypoxia or EPO-secreting tumour), no splenomegaly."},
 {sys:"Haematology",a:"Warm autoimmune haemolytic anaemia",b:"Cold autoimmune haemolytic anaemia",correct:"a",stem:"Haemolysis with spherocytes, DAT positive for IgG, linked to CLL/SLE/drugs.",why:"IgG, extravascular, warm-reacting = warm AIHA (steroids). Cold AIHA: IgM, agglutination in the cold, after Mycoplasma/EBV, with acrocyanosis."},
 {sys:"Haematology",a:"Hereditary spherocytosis",b:"G6PD deficiency",correct:"a",stem:"Chronic haemolysis + spherocytes + splenomegaly + positive osmotic fragility; autosomal dominant family history.",why:"Spherocytes + osmotic fragility + AD inheritance = hereditary spherocytosis. G6PD: X-linked, EPISODIC haemolysis after oxidant drugs/fava beans, with bite cells + Heinz bodies."},
 {sys:"Haematology",a:"Multiple myeloma",b:"MGUS",correct:"a",stem:"Bone pain + anaemia + hyperCALCAEMIA + renal failure + LYTIC lesions; paraprotein >30 g/L, marrow plasma cells >10%.",why:"CRAB features + high paraprotein/marrow plasma cells = myeloma. MGUS: paraprotein <30 g/L, marrow <10%, NO CRAB \u2014 asymptomatic, just monitor."},
 {sys:"Haematology",a:"Sideroblastic anaemia",b:"Iron-deficiency anaemia",correct:"a",stem:"Microcytic anaemia with HIGH ferritin and RING sideroblasts on marrow.",why:"High ferritin + ring sideroblasts = sideroblastic anaemia. IDA: LOW ferritin, high TIBC, low transferrin saturation."},
 {sys:"Rheumatology",a:"Reactive arthritis",b:"Gonococcal arthritis",correct:"a",stem:"Asymmetric oligoarthritis + urethritis + conjunctivitis ~2 weeks after dysentery/STI; STERILE aspirate.",why:"Sterile joint + post-infective triad ('can't see, pee, climb a tree') = reactive arthritis. Gonococcal: POSITIVE cultures, migratory, pustular rash, sexually active."},
 {sys:"Rheumatology",a:"Antiphospholipid syndrome",b:"Systemic lupus erythematosus",correct:"a",stem:"Recurrent thromboses + recurrent miscarriages + thrombocytopenia + a paradoxically prolonged APTT.",why:"Thrombosis + pregnancy loss + antiphospholipid antibodies (lupus anticoagulant/anti-cardiolipin) = APS. SLE: multisystem inflammatory disease, anti-dsDNA (APS may be secondary to it)."},
 {sys:"Rheumatology",a:"Granulomatosis with polyangiitis",b:"Goodpasture syndrome",correct:"a",stem:"Sinusitis + SADDLE-nose + pulmonary nodules + glomerulonephritis; c-ANCA/PR3 positive.",why:"ENT + lung + kidney + c-ANCA = GPA. Goodpasture: pulmonary haemorrhage + GN with anti-GBM antibodies and NO ENT/sinus involvement."},
 {sys:"Rheumatology",a:"Fibromyalgia",b:"Polymyalgia rheumatica",correct:"a",stem:"Widespread pain + multiple tender points + fatigue and poor sleep, with NORMAL ESR/CK, age 30-50.",why:"Normal inflammatory markers + tender points + younger = fibromyalgia. PMR: age >50, RAISED ESR, proximal stiffness, dramatic steroid response."},
 {sys:"Dermatology",a:"Eczema herpeticum",b:"Impetigo",correct:"a",stem:"Rapidly spreading PUNCHED-OUT monomorphic erosions + fever in a child with known eczema.",why:"Punched-out monomorphic vesicles/erosions + systemic upset = eczema herpeticum (HSV; emergency aciclovir). Impetigo: GOLDEN-crusted localised lesions in a well child (staph/strep)."},
 {sys:"Dermatology",a:"Erythema nodosum",b:"Cellulitis",correct:"a",stem:"Tender red NODULES on BOTH shins + arthralgia; linked to sarcoid/IBD/strep/drugs.",why:"Bilateral tender shin nodules + systemic association = erythema nodosum (a panniculitis). Cellulitis: UNILATERAL spreading erythema + fever + a skin breach."},
 {sys:"Dermatology",a:"Tinea corporis",b:"Discoid eczema",correct:"a",stem:"Itchy ANNULAR plaque with a raised scaly ADVANCING edge and central clearing; KOH shows hyphae.",why:"Active scaly raised edge + central clearing + hyphae = tinea (antifungal). Discoid eczema: coin-shaped, UNIFORMLY scaly/crusted, no central clearing (treat with steroids)."},
 {sys:"Dermatology",a:"Staphylococcal scalded skin syndrome",b:"Stevens-Johnson syndrome",correct:"a",stem:"Young CHILD: fever + diffuse tender erythema then SUPERFICIAL peeling + perioral crusting; MUCOSA SPARED.",why:"Toxin-mediated SUPERFICIAL split (granular layer), mucosa spared, young child = SSSS (anti-staph antibiotics). SJS: drug-induced, MUCOSAL erosions, full-thickness detachment, older."},
 {sys:"Dermatology",a:"Actinic keratosis",b:"Squamous cell carcinoma",correct:"a",stem:"A rough scaly patch on chronically sun-exposed skin that is NON-tender and slow-growing.",why:"Scaly premalignant patch = actinic keratosis. SCC: a thicker, TENDER, ulcerated, faster-growing nodule that can metastasise."},
 {sys:"Psychiatry",a:"Schizophreniform disorder",b:"Schizophrenia",correct:"a",stem:"Psychotic symptoms + functional decline present for 2 MONTHS (i.e. 1-6 months).",why:"Duration 1-6 months = schizophreniform. Schizophrenia: symptoms for \u22656 months. (Brief psychotic disorder: <1 month with full recovery.)"},
 {sys:"Psychiatry",a:"Delusional disorder",b:"Schizophrenia",correct:"a",stem:"A single fixed NON-bizarre delusion (e.g. being followed) with otherwise normal functioning and NO hallucinations.",why:"Isolated non-bizarre delusion + preserved function = delusional disorder. Schizophrenia: hallucinations, disorganisation, negative symptoms and decline."},
 {sys:"Psychiatry",a:"Conversion disorder",b:"Factitious disorder",correct:"a",stem:"Neurological symptoms (paralysis/blindness) with no organic cause, NOT intentionally produced, classic 'la belle indiff\u00e9rence'.",why:"Symptoms are UNCONSCIOUS, not feigned = conversion (functional neurological disorder). Factitious: symptoms INTENTIONALLY produced to assume the sick role (no external gain \u2014 vs malingering, which seeks external gain)."},
 {sys:"Psychiatry",a:"Lithium toxicity",b:"Serotonin syndrome",correct:"a",stem:"Coarse TREMOR + ataxia + confusion + polyuria + GI upset in a patient on lithium.",why:"Coarse tremor + ataxia + lithium use = lithium toxicity (check level, stop lithium, fluids). Serotonin syndrome: HYPERREFLEXIA + clonus after serotonergic drugs."},
 {sys:"Psychiatry",a:"Postpartum psychosis",b:"Postnatal depression",correct:"a",stem:"New mother around day 5: rapidly fluctuating mood + DELUSIONS about the baby + disorganisation.",why:"Psychosis + rapid onset + risk to mother/baby = postpartum psychosis (emergency admission). Postnatal depression: low mood/anhedonia over weeks, NO psychosis."},
 {sys:"Psychiatry",a:"Alcohol withdrawal seizure",b:"Delirium tremens",correct:"a",stem:"A generalised tonic-clonic seizure 12-48 HOURS after the last drink, before any frank delirium.",why:"12-48 h + tonic-clonic seizure = alcohol withdrawal seizure. Delirium tremens: 48-72 h, autonomic instability + delirium + hallucinations (medical emergency)."},
 {sys:"Obs & Gynae",a:"Pelvic inflammatory disease",b:"Ectopic pregnancy",correct:"a",stem:"BILATERAL lower abdominal pain + cervical motion tenderness + fever + discharge; NEGATIVE pregnancy test.",why:"Bilateral pain + fever + discharge + NEGATIVE \u03b2hCG = PID. Ectopic: UNILATERAL pain + POSITIVE \u03b2hCG + an adnexal mass / empty uterus."},
 {sys:"Obs & Gynae",a:"Placenta accreta",b:"Placenta praevia",correct:"a",stem:"Placenta fails to separate after delivery with torrential PPH; it has invaded the myometrium (prior caesarean).",why:"Abnormal myometrial invasion + retained placenta + PPH = accreta (risk with prior CS + praevia). Praevia: a low-lying placenta causing painless ANTEPARTUM bleeding."},
 {sys:"Obs & Gynae",a:"Eclampsia",b:"Pre-eclampsia",correct:"a",stem:"Pre-eclampsia features PLUS a generalised tonic-clonic SEIZURE.",why:"A seizure superimposed on pre-eclampsia = eclampsia (magnesium sulfate + delivery). Pre-eclampsia: hypertension + proteinuria after 20 weeks, no seizure yet."},
 {sys:"Obs & Gynae",a:"Gestational diabetes",b:"Pre-existing diabetes",correct:"a",stem:"Raised glucose FIRST detected at 26 weeks on OGTT, with normal glucose before pregnancy.",why:"Onset during pregnancy, resolves postpartum = gestational diabetes. Pre-existing: high HbA1c pre-conception, higher congenital malformation risk."},
 {sys:"Obs & Gynae",a:"Primary postpartum haemorrhage",b:"Secondary postpartum haemorrhage",correct:"a",stem:"Heavy bleeding (>500 mL) within 24 HOURS of delivery with a boggy, atonic uterus.",why:"<24 h + uterine atony = primary PPH (commonest cause atony \u2014 the 4 T's). Secondary PPH: 24 h to 12 weeks, usually retained products or endometritis."},
 {sys:"Obs & Gynae",a:"Ovarian torsion",b:"Ruptured ovarian cyst",correct:"a",stem:"Sudden severe UNILATERAL pelvic pain + vomiting + a tender adnexal mass + ABSENT Doppler flow.",why:"Adnexal mass + absent flow + severe pain = ovarian torsion (surgical emergency). Ruptured cyst: sudden pain after exertion/coitus + free fluid, usually settles conservatively."},
 {sys:"Obs & Gynae",a:"Missed miscarriage",b:"Complete miscarriage",correct:"a",stem:"Asymptomatic; scan shows a NON-VIABLE pregnancy still retained in utero with a closed os.",why:"Non-viable but RETAINED, minimal bleeding, closed os = missed miscarriage. Complete: products fully passed, EMPTY uterus, bleeding settling, closed os."},
 {sys:"Paediatrics",a:"Innocent murmur",b:"Pathological murmur",correct:"a",stem:"A soft, SYSTOLIC, vibratory murmur at the left sternal edge that VARIES with posture, in a well, asymptomatic child.",why:"Soft, systolic, position-varying, normal pulses, asymptomatic = innocent (the 'S' rules). Pathological: DIASTOLIC or loud/harsh (\u22653/6), a thrill, symptoms, or abnormal pulses."},
 {sys:"Paediatrics",a:"Transient synovitis",b:"Septic arthritis",correct:"a",stem:"Child after a viral URTI: limp + reduced hip movement but AFEBRILE, able to weight-bear, normal CRP.",why:"Afebrile + weight-bearing + normal inflammatory markers = transient synovitis (Kocher 0-1). Septic arthritis: febrile, NON-weight-bearing, raised WCC/ESR/CRP \u2014 joint washout."},
 {sys:"Paediatrics",a:"Pyloric stenosis",b:"Gastro-oesophageal reflux",correct:"a",stem:"First-born boy at 4-6 weeks: PROJECTILE non-bilious vomiting + visible peristalsis + a palpable 'olive' + hypochloraemic alkalosis.",why:"Projectile vomiting + olive + hypochloraemic hypokalaemic metabolic alkalosis = pyloric stenosis (Ramstedt pyloromyotomy). GORD: effortless posseting, thriving infant, normal bloods."},
 {sys:"Paediatrics",a:"Necrotising enterocolitis",b:"Malrotation with volvulus",correct:"a",stem:"PREMATURE neonate: abdominal distension + bloody stools + PNEUMATOSIS INTESTINALIS on X-ray.",why:"Prematurity + pneumatosis intestinalis + bloody stool = NEC. Malrotation with midgut volvulus: BILIOUS vomiting + a 'corkscrew' on contrast, often term babies \u2014 surgical emergency."},
 {sys:"Paediatrics",a:"Roseola infantum",b:"Measles",correct:"a",stem:"Infant: HIGH fever for 3-4 days, then a maculopapular rash appears AS the fever breaks; the child looks well.",why:"Fever first, rash on defervescence, well child (HHV-6) = roseola. Measles: rash appears WITH ongoing fever + Koplik spots + a miserable child."},
 {sys:"Paediatrics",a:"Whooping cough",b:"Bronchiolitis",correct:"a",stem:"Paroxysmal coughing fits with an inspiratory 'WHOOP' + post-tussive vomiting; marked lymphocytosis.",why:"Paroxysms + whoop + post-tussive vomiting + lymphocytosis = pertussis (Bordetella; macrolide). Bronchiolitis: wheeze + fine crackles + RSV in an infant under 1."},
 {sys:"Paediatrics",a:"Duchenne muscular dystrophy",b:"Becker muscular dystrophy",correct:"a",stem:"Boy ~4 years: proximal weakness + GOWERS' sign + calf pseudohypertrophy + very high CK; wheelchair by ~12.",why:"Earlier, severe, frameshift (no dystrophin) = Duchenne. Becker: milder, later onset, partial dystrophin retained, ambulant for longer."},
 {sys:"Infectious Disease",a:"Falciparum malaria",b:"Typhoid fever",correct:"a",stem:"Returning traveller: cyclical fevers + RIGORS + haemolysis + thrombocytopenia; ring forms on the blood film.",why:"Cyclical fever + parasites on thick/thin films = falciparum malaria (emergency). Typhoid: STEPWISE fever, relative bradycardia, rose spots, constipation then diarrhoea, blood/stool culture."},
 {sys:"Infectious Disease",a:"Dengue fever",b:"Malaria",correct:"a",stem:"Traveller: high fever + severe 'BREAK-BONE' myalgia + RETRO-ORBITAL pain + rash + thrombocytopenia; blood film NEGATIVE for parasites.",why:"Break-bone myalgia + retro-orbital pain + negative film = dengue. Malaria: POSITIVE blood film with cyclical rigors."},
 {sys:"Infectious Disease",a:"Erysipelas",b:"Cellulitis",correct:"a",stem:"A sharply DEMARCATED, raised, fiery-red facial plaque + fever (superficial dermis/lymphatics), usually streptococcal.",why:"Well-demarcated, raised, sharp border (upper dermis) = erysipelas. Cellulitis: DEEPER, with ILL-defined borders into the subcutis."},
 {sys:"Infectious Disease",a:"Latent tuberculosis",b:"Active tuberculosis",correct:"a",stem:"A POSITIVE IGRA/Mantoux but ASYMPTOMATIC, with a normal CXR and non-infectious.",why:"Positive immune test, no symptoms, normal CXR, non-infectious = latent TB. Active TB: cough/weight loss/night sweats + abnormal CXR + AFB-positive sputum (infectious)."},
 {sys:"Cardiology",a:"Wolff-Parkinson-White syndrome",b:"AV nodal re-entrant tachycardia",correct:"a",stem:"Young patient with palpitations; resting ECG shows a SHORT PR and a DELTA wave.",why:"Delta wave + short PR (an accessory pathway) = WPW (AVRT; avoid AV-node blockers in AF). AVNRT: narrow-complex regular SVT with NO delta wave/pre-excitation."},
 {sys:"Cardiology",a:"Aortic dissection (Stanford A)",b:"Aortic dissection (Stanford B)",correct:"a",stem:"Tearing chest pain radiating to the back; dissection involves the ASCENDING aorta.",why:"Ascending aorta = Stanford A (SURGICAL emergency \u2014 risk of tamponade/AR). Stanford B: descending aorta only \u2014 usually MEDICAL management (BP control)."},
 {sys:"Cardiology",a:"Cardiac (arrhythmic) syncope",b:"Vasovagal syncope",correct:"a",stem:"Syncope with NO prodrome, during EXERTION, with palpitations and a family history of sudden death.",why:"Exertional, no warning, palpitations = cardiac syncope (sinister \u2014 investigate). Vasovagal: clear triggers (pain, standing), prodrome (nausea, sweating, tunnel vision), benign."},
 {sys:"Cardiology",a:"Long QT syndrome",b:"Brugada syndrome",correct:"a",stem:"Syncope/torsades de pointes with a prolonged QT on ECG.",why:"Prolonged QT \u2192 torsades = long QT syndrome. Brugada: COVED ST elevation in V1-V3 + RBBB pattern (SCN5A), sudden death typically during sleep."},
 {sys:"Cardiology",a:"Acute mitral regurgitation",b:"Chronic mitral regurgitation",correct:"a",stem:"Sudden pulmonary oedema + a new murmur after an inferior MI (papillary muscle rupture); normal heart size.",why:"Sudden + flash pulmonary oedema + normal-sized heart = acute MR (surgical). Chronic MR: dilated LA, AF, gradual, compensated for years."},
 {sys:"Cardiology",a:"Hypertensive emergency",b:"Hypertensive urgency",correct:"a",stem:"Very high BP WITH acute end-organ damage (encephalopathy, papilloedema, AKI, chest pain).",why:"Severe BP + ACUTE end-organ damage = emergency (controlled IV lowering). Urgency: very high BP but NO acute end-organ damage \u2014 oral agents, gradual reduction."},
 {sys:"Respiratory",a:"Obstructive sleep apnoea",b:"Central sleep apnoea",correct:"a",stem:"Obese snorer with daytime somnolence; apnoeas WITH continued respiratory EFFORT against a collapsed airway.",why:"Continued effort against an occluded pharynx = OSA (CPAP, weight loss). Central: NO respiratory effort during apnoeas (brainstem/heart failure, Cheyne-Stokes)."},
 {sys:"Respiratory",a:"Empyema",b:"Simple parapneumonic effusion",correct:"a",stem:"Pneumonia + an effusion with pus/LOW pH (<7.2), low glucose, high LDH; loculated.",why:"Pus / pH <7.2 / loculation = empyema (needs CHEST DRAIN). Simple parapneumonic: free-flowing, pH >7.2, resolves with antibiotics alone."},
 {sys:"Respiratory",a:"Legionella pneumonia",b:"Mycoplasma pneumonia",correct:"a",stem:"Atypical pneumonia + HYPONATRAEMIA + deranged LFTs + diarrhoea after a hotel/air-conditioning stay.",why:"Hyponatraemia + LFT derangement + diarrhoea + water source = Legionella (urinary antigen). Mycoplasma: younger, cold agglutinins/haemolysis, erythema multiforme."},
 {sys:"Respiratory",a:"Allergic bronchopulmonary aspergillosis",b:"Asthma",correct:"a",stem:"Poorly controlled asthma + recurrent infiltrates + brown mucus plugs + HIGH IgE + eosinophilia + central bronchiectasis.",why:"Fleeting infiltrates + very high IgE + Aspergillus sensitisation = ABPA (steroids \u00b1 antifungal). Asthma: reversible obstruction without infiltrates or central bronchiectasis."},
 {sys:"Respiratory",a:"Silicosis",b:"Asbestosis",correct:"a",stem:"Progressive dyspnoea in a quarry/sandblaster; UPPER-zone nodular fibrosis + 'eggshell' hilar calcification.",why:"Upper-zone nodules + eggshell calcification + silica exposure = silicosis (raised TB risk). Asbestosis: LOWER-zone fibrosis + pleural plaques, mesothelioma risk."},
 {sys:"Gastro",a:"Hepatocellular carcinoma",b:"Liver metastases",correct:"a",stem:"Cirrhotic patient: a SOLITARY arterial-enhancing mass with washout + rising ALPHA-FETOPROTEIN.",why:"Cirrhosis + arterial enhancement/washout + raised AFP = HCC. Liver metastases: MULTIPLE lesions, a known primary (colorectal, etc.), normal AFP."},
 {sys:"Gastro",a:"Spontaneous bacterial peritonitis",b:"Secondary bacterial peritonitis",correct:"a",stem:"Cirrhotic with ascites: fever + abdominal pain; ascitic neutrophils >250 with a SINGLE organism.",why:"Ascites + neutrophils >250 + monomicrobial, no surgical source = SBP (cefotaxime). Secondary peritonitis: a perforation/surgical source, POLYMICROBIAL, needs surgery."},
 {sys:"Gastro",a:"Gilbert's syndrome",b:"Crigler-Najjar syndrome",correct:"a",stem:"Mild intermittent UNCONJUGATED hyperbilirubinaemia triggered by fasting/illness; otherwise well.",why:"Mild, benign, fasting-triggered unconjugated jaundice = Gilbert's (no treatment). Crigler-Najjar: SEVERE unconjugated hyperbilirubinaemia from birth, kernicterus risk (UGT1A1 absent)."},
 {sys:"Gastro",a:"Whipple's disease",b:"Coeliac disease",correct:"a",stem:"Middle-aged man: malabsorption + arthralgia + fever + neurological signs; PAS-positive macrophages (Tropheryma whipplei).",why:"Malabsorption + arthralgia + CNS signs + PAS-positive macrophages = Whipple's (antibiotics). Coeliac: villous atrophy + anti-TTG, gluten-driven, dermatitis herpetiformis."},
 {sys:"Gastro",a:"Angiodysplasia",b:"Diverticular bleed",correct:"a",stem:"Elderly: recurrent painless lower GI bleeding; angiography shows a vascular malformation (linked to aortic stenosis).",why:"Recurrent painless bleed + vascular malformation (Heyde with AS) = angiodysplasia. Diverticular bleed: sudden, painless, often larger-volume, from a diverticulum."},
 {sys:"Neurology",a:"Migraine with aura",b:"Transient ischaemic attack",correct:"a",stem:"Visual zig-zags spreading over 20-30 MINUTES then a headache, in a young patient with prior similar episodes.",why:"Gradual SPREADING positive visual phenomena + headache + stereotyped/recurrent = migraine aura. TIA: SUDDEN-onset NEGATIVE symptoms (loss of vision/power), vascular risk factors, no march."},
 {sys:"Neurology",a:"Idiopathic intracranial hypertension",b:"Cerebral venous sinus thrombosis",correct:"a",stem:"Obese young woman: headache + papilloedema + visual obscurations; normal imaging, high opening pressure.",why:"Obese young woman + papilloedema + normal venogram = IIH (acetazolamide, weight loss). CVST: thrombus on venography, seizures/focal signs, prothrombotic/pregnant."},
 {sys:"Neurology",a:"Normal pressure hydrocephalus",b:"Alzheimer's disease",correct:"a",stem:"Elderly: GAIT apraxia + urinary incontinence + dementia ('wet, wacky, wobbly'); ventriculomegaly.",why:"The triad (gait, incontinence, cognition) + big ventricles = NPH (shunt-responsive). Alzheimer's: early MEMORY loss dominates, gait/continence preserved until late."},
 {sys:"Neurology",a:"Motor neurone disease",b:"Cervical spondylotic myelopathy",correct:"a",stem:"Mixed UMN AND LMN signs (wasting + brisk reflexes) with NO sensory loss and NO sphincter involvement.",why:"UMN + LMN signs + NO sensory loss = MND. Cervical myelopathy: SENSORY level + sphincter involvement, LMN signs at the level and UMN signs below."},
 {sys:"Neurology",a:"Brown-S\u00e9quard syndrome",b:"Transverse myelitis",correct:"a",stem:"Hemicord lesion: IPSILATERAL weakness + loss of proprioception, CONTRALATERAL loss of pain/temperature.",why:"Ipsilateral motor/dorsal-column loss + contralateral spinothalamic loss = Brown-S\u00e9quard (cord hemisection). Transverse myelitis: BILATERAL symmetrical motor/sensory level + sphincter involvement."},
 {sys:"Neurology",a:"Progressive supranuclear palsy",b:"Parkinson's disease",correct:"a",stem:"Parkinsonism + EARLY falls + VERTICAL gaze palsy + poor levodopa response, symmetrical.",why:"Early falls + vertical gaze palsy + symmetric + levodopa-unresponsive = PSP. Parkinson's: asymmetric RESTING tremor, good levodopa response, no early gaze palsy."},
 {sys:"Endocrine",a:"Sheehan's syndrome",b:"Pituitary apoplexy",correct:"a",stem:"Postpartum woman after major haemorrhage: failure to LACTATE + amenorrhoea + fatigue (gradual hypopituitarism).",why:"Postpartum pituitary infarction \u2192 gradual hypopituitarism (failure to lactate) = Sheehan's. Apoplexy: SUDDEN severe headache + visual loss + ophthalmoplegia from haemorrhage into an adenoma."},
 {sys:"Endocrine",a:"Addisonian crisis",b:"Septic shock",correct:"a",stem:"Hypotension + hyponatraemia + HYPERkalaemia + hypoglycaemia + hyperpigmentation, not responding to fluids alone.",why:"Hyperkalaemia + hyponatraemia + hyperpigmentation + steroid-responsive = Addisonian crisis (IV hydrocortisone). Septic shock: a clear infection source, usually normal/low K, responds to fluids/pressors/antibiotics."},
 {sys:"Endocrine",a:"MEN1",b:"MEN2",correct:"a",stem:"Familial: Parathyroid hyperplasia + Pituitary adenoma + Pancreatic tumour (the 'three P's').",why:"Parathyroid + pituitary + pancreas = MEN1 (MEN1 gene). MEN2: MEDULLARY thyroid carcinoma + phaeochromocytoma + parathyroid (2A) / mucosal neuromas (2B) \u2014 RET gene."},
 {sys:"Endocrine",a:"Primary hyperaldosteronism",b:"Secondary hyperaldosteronism",correct:"a",stem:"Hypertension + hypokalaemia with HIGH aldosterone and LOW renin.",why:"High aldosterone + LOW renin (Conn's adenoma/hyperplasia) = primary. Secondary: HIGH renin AND aldosterone (renal artery stenosis, heart failure, cirrhosis driving the RAAS)."},
 {sys:"Nephrology",a:"Calcium oxalate stones",b:"Uric acid stones",correct:"a",stem:"Recurrent renal stones that are RADIO-OPAQUE on X-ray; envelope-shaped crystals; commonest type.",why:"Radio-opaque + commonest = calcium oxalate. Uric acid stones: RADIOLUCENT (need CT/US), form in ACID urine, linked to gout \u2014 dissolve with urinary alkalinisation."},
 {sys:"Nephrology",a:"Struvite (staghorn) stones",b:"Cystine stones",correct:"a",stem:"A large STAGHORN calculus filling the renal pelvis, with ALKALINE urine and urease-producing Proteus.",why:"Staghorn + alkaline urine + urease organism (Proteus) = struvite. Cystine stones: children/young adults with cystinuria, HEXAGONAL crystals, faintly radio-opaque, recurrent."},
 {sys:"Nephrology",a:"ADPKD",b:"ARPKD",correct:"a",stem:"Adult with hypertension + haematuria + bilateral flank masses + a family history; berry-aneurysm risk.",why:"Adult onset + autosomal DOMINANT + berry aneurysms/liver cysts = ADPKD. ARPKD: presents in INFANCY (autosomal recessive), with congenital hepatic fibrosis and Potter sequence."},
 {sys:"Nephrology",a:"Membranous nephropathy",b:"Minimal change disease",correct:"a",stem:"ADULT with nephrotic syndrome; biopsy shows subepithelial deposits / 'spike-and-dome'; anti-PLA2R positive.",why:"Adult nephrotic + subepithelial deposits + anti-PLA2R = membranous (commonest adult nephrotic; malignancy/SLE link). Minimal change: CHILDREN, normal light microscopy, steroid-responsive."},
 {sys:"Haematology",a:"Heparin-induced thrombocytopenia",b:"Disseminated intravascular coagulation",correct:"a",stem:"Platelet count FALLS ~5-10 days after starting heparin, with new THROMBOSIS (not bleeding); anti-PF4 antibodies.",why:"Platelet drop on heparin + thrombosis + anti-PF4 = HIT (stop heparin, use a non-heparin anticoagulant). DIC: consumption with BLEEDING + clotting, low fibrinogen, high D-dimer."},
 {sys:"Haematology",a:"Essential thrombocythaemia",b:"Reactive thrombocytosis",correct:"a",stem:"Persistently very high platelets + thrombosis/bleeding + splenomegaly; JAK2/CALR mutation.",why:"Sustained high platelets + JAK2/CALR + thrombotic/bleeding events = essential thrombocythaemia. Reactive: secondary to infection/iron deficiency/inflammation, resolves with the cause."},
 {sys:"Haematology",a:"Myelofibrosis",b:"Chronic myeloid leukaemia",correct:"a",stem:"Massive splenomegaly + a LEUKOERYTHROBLASTIC film with TEAR-DROP cells + a 'dry tap' marrow.",why:"Tear-drop cells + dry tap + marrow fibrosis = myelofibrosis. CML: Philadelphia chromosome (BCR-ABL), neutrophilia across the whole myeloid spectrum, no tear-drop cells."},
 {sys:"Haematology",a:"Aplastic anaemia",b:"Myelodysplastic syndrome",correct:"a",stem:"PANCYTOPENIA with a HYPOCELLULAR marrow and NO abnormal/dysplastic cells.",why:"Hypocellular marrow + no dysplasia = aplastic anaemia. MDS: usually HYPERcellular/normocellular marrow with DYSPLASIA and blasts, risk of AML transformation, older patients."},
 {sys:"Haematology",a:"Alpha thalassaemia",b:"Beta thalassaemia",correct:"a",stem:"Microcytic anaemia from birth/early infancy; HbH or Bart's; normal HbA2.",why:"Symptomatic from BIRTH (alpha chains needed for fetal Hb) + normal HbA2 = alpha thalassaemia. Beta thalassaemia: presents after ~6 months (HbF\u2192HbA switch), RAISED HbA2."},
 {sys:"Rheumatology",a:"Dermatomyositis",b:"Polymyositis",correct:"a",stem:"Proximal muscle weakness PLUS a heliotrope rash + Gottron papules + raised CK; malignancy association.",why:"Skin signs (heliotrope, Gottron) + proximal weakness + raised CK = dermatomyositis (screen for malignancy). Polymyositis: identical weakness/CK but NO skin involvement."},
 {sys:"Rheumatology",a:"Limited cutaneous systemic sclerosis",b:"Diffuse cutaneous systemic sclerosis",correct:"a",stem:"CREST features + skin tightening confined to hands/face; ANTI-CENTROMERE antibody.",why:"Distal skin + CREST + anti-centromere = limited (pulmonary hypertension risk). Diffuse: rapid PROXIMAL/truncal skin + anti-Scl-70, early lung fibrosis and renal crisis."},
 {sys:"Rheumatology",a:"Sj\u00f6gren's syndrome",b:"Systemic lupus erythematosus",correct:"a",stem:"DRY eyes + dry mouth + parotid swelling; anti-Ro/La positive, positive Schirmer test.",why:"Sicca symptoms + anti-Ro/La + lymphoma risk = Sj\u00f6gren's. SLE: multisystem (malar rash, nephritis, serositis) with anti-dsDNA (Sj\u00f6gren's can be secondary to it)."},
 {sys:"Rheumatology",a:"Osteoporosis",b:"Osteomalacia",correct:"a",stem:"Fragility fracture with NORMAL calcium, phosphate and ALP but low bone density on DEXA.",why:"Normal biochemistry + low BMD = osteoporosis. Osteomalacia: LOW calcium/phosphate + HIGH ALP (vitamin D deficiency), bone PAIN and Looser's pseudofractures."},
 {sys:"Rheumatology",a:"Paget's disease of bone",b:"Osteomalacia",correct:"a",stem:"Elderly: isolated very HIGH ALP + bone pain + enlarging skull/bowed tibia; normal calcium/phosphate.",why:"Isolated raised ALP + bony deformity + normal Ca/PO4 = Paget's (bisphosphonates). Osteomalacia: LOW calcium/phosphate with high ALP, proximal myopathy, Looser's zones."},
 {sys:"Dermatology",a:"Lichen planus",b:"Psoriasis",correct:"a",stem:"Itchy PURPLE polygonal flat-topped papules on the wrists with lacy white 'Wickham's striae'.",why:"Purple, polygonal, pruritic papules + Wickham's striae + oral involvement = lichen planus. Psoriasis: SALMON plaques with SILVERY scale on extensors + nail pitting."},
 {sys:"Dermatology",a:"Pityriasis rosea",b:"Guttate psoriasis",correct:"a",stem:"A single 'HERALD patch' then a 'Christmas-tree' distribution of oval scaly macules; self-limiting.",why:"Herald patch + Christmas-tree pattern + self-resolving (?HHV) = pityriasis rosea. Guttate psoriasis: 'raindrop' scaly papules ~2 weeks after a STREP throat infection."},
 {sys:"Dermatology",a:"Rosacea",b:"Acne vulgaris",correct:"a",stem:"Middle-aged adult: central facial erythema + telangiectasia + flushing + papulopustules but NO comedones.",why:"Flushing + telangiectasia + NO comedones (and may cause rhinophyma) = rosacea. Acne vulgaris: COMEDONES (blackheads/whiteheads) + seborrhoea in a younger patient."},
 {sys:"Dermatology",a:"Pityriasis versicolor",b:"Vitiligo",correct:"a",stem:"Scaly hypo/hyperpigmented macules on the trunk that fail to tan; KOH shows 'spaghetti and meatballs'.",why:"SCALY patches + Malassezia on microscopy = pityriasis versicolor (antifungal). Vitiligo: COMPLETELY depigmented, non-scaly macules (autoimmune melanocyte loss), Wood's lamp bright."},
 {sys:"Dermatology",a:"Bowen's disease",b:"Actinic keratosis",correct:"a",stem:"A well-demarcated red SCALY plaque on sun-exposed skin; biopsy = full-thickness dysplasia (SCC in situ).",why:"Full-thickness dysplasia (carcinoma in situ) = Bowen's disease. Actinic keratosis: PARTIAL-thickness dysplasia \u2014 a rough scaly premalignant patch, lower malignant potential."},
 {sys:"Psychiatry",a:"Mania",b:"Hypomania",correct:"a",stem:"Elevated mood for over a week WITH psychotic features / marked impairment / needing admission.",why:"Severe, \u22651 week, psychosis or marked impairment/hospitalisation = mania (bipolar I). Hypomania: milder, \u22654 days, NO psychosis and NO marked functional impairment (bipolar II)."},
 {sys:"Psychiatry",a:"Acute dystonia",b:"Tardive dyskinesia",correct:"a",stem:"HOURS after starting an antipsychotic: sustained muscle spasms \u2014 torticollis, oculogyric crisis (young male).",why:"Early (hours-days) sustained spasms = acute dystonia (procyclidine). Tardive dyskinesia: LATE (months-years) repetitive orofacial choreoathetoid movements, often irreversible."},
 {sys:"Psychiatry",a:"Akathisia",b:"Restless legs syndrome",correct:"a",stem:"Inner restlessness with an inability to stay still, soon after starting/increasing an antipsychotic.",why:"Drug-induced motor restlessness (antipsychotic) = akathisia (reduce dose, propranolol). Restless legs: an urge to move the legs at NIGHT/at rest, relieved by movement, linked to iron deficiency."},
 {sys:"Psychiatry",a:"Illness anxiety disorder",b:"Somatic symptom disorder",correct:"a",stem:"Persistent preoccupation with HAVING a serious disease despite MINIMAL or no actual symptoms and normal tests.",why:"Fear of having a disease with few/no somatic symptoms = illness anxiety (hypochondriasis). Somatic symptom disorder: real distressing SYMPTOMS with disproportionate thoughts/anxiety about them."},
 {sys:"Obs & Gynae",a:"Bacterial vaginosis",b:"Trichomoniasis",correct:"a",stem:"Thin grey FISHY-smelling discharge; pH >4.5; CLUE cells; NO inflammation/itch.",why:"Fishy odour + clue cells + pH >4.5 + no inflammation = BV (Gardnerella; metronidazole). Trichomoniasis: FROTHY green, itchy, 'strawberry cervix', motile trophozoites \u2014 treat partners."},
 {sys:"Obs & Gynae",a:"Polycystic ovary syndrome",b:"Hypothalamic amenorrhoea",correct:"a",stem:"Oligomenorrhoea + hirsutism + acne + raised LH:FSH and androgens; polycystic ovaries.",why:"Hyperandrogenism + raised LH:FSH + polycystic ovaries = PCOS. Hypothalamic amenorrhoea: LOW LH/FSH/oestrogen from low weight/excess exercise/stress \u2014 no hyperandrogenism."},
 {sys:"Obs & Gynae",a:"Complete hydatidiform mole",b:"Partial hydatidiform mole",correct:"a",stem:"Very high hcG + 'snowstorm' uterus with NO fetal tissue; diploid 46XX of paternal origin.",why:"No fetus + diploid paternal + markedly high hCG + higher malignant potential = complete mole. Partial mole: TRIPLOID with some fetal tissue, lower hCG, lower malignant risk."},
 {sys:"Obs & Gynae",a:"Cord prolapse",b:"Vasa praevia",correct:"a",stem:"After membrane rupture: fetal bradycardia with a palpable PULSATING cord in the vagina.",why:"A palpable pulsating cord + fetal bradycardia = cord prolapse (relieve pressure, immediate delivery). Vasa praevia: painless bleeding at ROM with fetal exsanguination \u2014 no palpable cord."},
 {sys:"Obs & Gynae",a:"Endometrial cancer",b:"Cervical cancer",correct:"a",stem:"POSTMENOPAUSAL bleeding in an obese diabetic woman; thickened endometrium on scan.",why:"Postmenopausal bleeding + obesity/unopposed oestrogen + thick endometrium = endometrial cancer (hysteroscopy + biopsy). Cervical cancer: post-COITAL bleeding, younger, HPV, abnormal smear/cervix."},
 {sys:"Paediatrics",a:"Tetralogy of Fallot",b:"Transposition of the great arteries",correct:"a",stem:"Cyanotic child with 'TET spells' relieved by squatting; boot-shaped heart on CXR.",why:"Tet spells + squatting + boot-shaped heart = Tetralogy of Fallot (presents in infancy/childhood). TGA: cyanosis within HOURS of birth, 'egg-on-a-string' heart, duct-dependent (prostaglandin)."},
 {sys:"Paediatrics",a:"Biliary atresia",b:"Neonatal physiological jaundice",correct:"a",stem:"2-week-old with PROLONGED jaundice + PALE stools + dark urine + CONJUGATED hyperbilirubinaemia.",why:"Prolonged CONJUGATED jaundice + pale stools = biliary atresia (urgent Kasai before 8 weeks). Physiological jaundice: UNCONJUGATED, days 2-14, normal stools, self-resolving."},
 {sys:"Paediatrics",a:"Hirschsprung disease",b:"Meconium ileus",correct:"a",stem:"Term neonate: failure to pass meconium >48 h + abdominal distension; rectal biopsy shows ABSENT ganglion cells.",why:"Delayed meconium + absent ganglion cells on suction biopsy = Hirschsprung. Meconium ileus: distal ileal obstruction by thick meconium, almost always CYSTIC FIBROSIS."},
 {sys:"Paediatrics",a:"Cystic fibrosis",b:"Primary ciliary dyskinesia",correct:"a",stem:"Recurrent chest infections + steatorrhoea/failure to thrive + a high SWEAT chloride.",why:"Pancreatic insufficiency + high sweat chloride + CFTR = cystic fibrosis. Primary ciliary dyskinesia: bronchiectasis + sinusitis + situs inversus (Kartagener), normal sweat test, infertility."},
 {sys:"Paediatrics",a:"Meningococcal septicaemia",b:"Henoch-Sch\u00f6nlein purpura",correct:"a",stem:"Febrile, unwell child with a rapidly spreading NON-BLANCHING purpuric rash + shock.",why:"Non-blanching rash + fever + shock/unwell = meningococcaemia (emergency benzylpenicillin). HSP: WELL/afebrile child, palpable purpura on buttocks/legs + abdominal pain + arthralgia after a URTI."},
 {sys:"Surgery",a:"Acute limb ischaemia",b:"Critical chronic limb ischaemia",correct:"a",stem:"SUDDEN painful, pale, pulseless, cold, paraesthetic leg (the 6 P's) in an AF patient.",why:"Sudden onset + the 6 P's (embolic) = acute limb ischaemia (emergency revascularisation <6 h). Critical chronic ischaemia: rest pain >2 weeks, ulcers/gangrene, gradual on a background of claudication."},
 {sys:"Surgery",a:"Arterial ulcer",b:"Venous ulcer",correct:"a",stem:"A PAINFUL, punched-out ulcer over the toes/lateral malleolus with absent pulses and a cold foot.",why:"Painful, punched-out, distal, absent pulses = arterial ulcer. Venous ulcer: shallow, exudative, over the GAITER area, with oedema/haemosiderin/lipodermatosclerosis, relatively painless."},
 {sys:"Surgery",a:"Intermittent claudication",b:"Neurogenic claudication",correct:"a",stem:"Calf pain on walking a FIXED distance, relieved promptly by STANDING STILL; absent foot pulses.",why:"Reproducible at a fixed distance, relieved by rest standing, absent pulses = vascular (intermittent) claudication. Neurogenic (spinal stenosis): relieved by SITTING/FLEXING forward, variable distance, normal pulses."},
 {sys:"Surgery",a:"Fibroadenoma",b:"Breast carcinoma",correct:"a",stem:"Young woman: a smooth, MOBILE, well-defined, painless 'breast mouse' that is not fixed.",why:"Young + mobile + smooth + well-defined = fibroadenoma (benign). Carcinoma: HARD, irregular, FIXED/tethered lump \u00b1 skin dimpling/nipple change, older, may have nodes."},
 {sys:"Surgery",a:"Breast abscess",b:"Inflammatory breast cancer",correct:"a",stem:"Lactating woman: a tender, fluctuant, erythematous breast lump + fever that responds to antibiotics/drainage.",why:"Lactation + fluctuant + fever + responds to drainage = breast abscess. Inflammatory breast cancer: peau d'orange + diffuse erythema, NO fever, does NOT resolve with antibiotics \u2014 biopsy."},
 {sys:"Surgery",a:"Papillary thyroid carcinoma",b:"Medullary thyroid carcinoma",correct:"a",stem:"Young patient with a thyroid nodule + cervical nodes; cytology shows 'Orphan-Annie' nuclei + psammoma bodies.",why:"Orphan-Annie nuclei + psammoma + lymphatic spread + good prognosis = papillary (commonest). Medullary: parafollicular C cells, raised CALCITONIN, part of MEN2 (RET)."},
 {sys:"Ophthalmology",a:"Scleritis",b:"Episcleritis",correct:"a",stem:"SEVERE boring eye pain that wakes the patient + a bluish hue + reduced vision; linked to vasculitis/RA.",why:"Severe pain + vision threat + vessels DON'T blanch with phenylephrine = scleritis (systemic disease, urgent). Episcleritis: mild/no pain, sectoral redness that BLANCHES, benign and self-limiting."},
 {sys:"Ophthalmology",a:"Retinal detachment",b:"Vitreous haemorrhage",correct:"a",stem:"Sudden floaters + flashes + a 'CURTAIN' descending over the vision; a grey billowing retina on exam.",why:"Flashes + curtain + a detached grey retina = retinal detachment (urgent). Vitreous haemorrhage: sudden floaters/loss of red reflex (diabetic neovascularisation), no curtain, retina obscured by blood."},
 {sys:"Ophthalmology",a:"Orbital cellulitis",b:"Preseptal cellulitis",correct:"a",stem:"Painful EYE MOVEMENTS + proptosis + reduced acuity/colour vision + ophthalmoplegia + a swollen lid.",why:"Painful/limited eye movements + proptosis + acuity change = orbital cellulitis (emergency IV antibiotics, CT). Preseptal: lid swelling/erythema only, NORMAL movements, vision and no proptosis."},
 {sys:"ENT",a:"Cholesteatoma",b:"Chronic suppurative otitis media",correct:"a",stem:"Persistent FOUL-smelling ear discharge + hearing loss + an attic retraction pocket eroding bone.",why:"Foul discharge + attic retraction + bony erosion = cholesteatoma (surgical \u2014 can cause facial palsy/abscess). CSOM: a central perforation with mucoid discharge, NO bony erosion."},
 {sys:"ENT",a:"Acoustic neuroma",b:"M\u00e9ni\u00e8re's disease",correct:"a",stem:"Progressive UNILATERAL sensorineural hearing loss + tinnitus + later facial numbness; cerebellopontine-angle mass.",why:"Progressive one-sided SNHL + a CPA mass (\u00b1 CN V/VII signs) = vestibular schwannoma (MRI). M\u00e9ni\u00e8re's: EPISODIC vertigo + fluctuating hearing loss + fullness, normal imaging."},
 {sys:"ENT",a:"Thyroglossal cyst",b:"Branchial cyst",correct:"a",stem:"A MIDLINE neck swelling that moves UP with tongue protrusion and swallowing.",why:"Midline + moves with tongue protrusion = thyroglossal cyst. Branchial cyst: LATERAL (anterior to sternocleidomastoid), does not move with the tongue, in a young adult."},
 {sys:"Infectious Disease",a:"Meningitis",b:"Encephalitis",correct:"a",stem:"Fever + neck stiffness + photophobia with a PRESERVED conscious level and normal cognition.",why:"Meningism + preserved consciousness = meningitis. Encephalitis: altered MENTATION/behaviour, seizures, focal deficits (e.g. HSV temporal lobe) \u2014 treat with aciclovir."},
 {sys:"Infectious Disease",a:"Gas gangrene",b:"Necrotising fasciitis",correct:"a",stem:"Rapid MYONECROSIS with crepitus + a sweet odour after a contaminated wound; Clostridium perfringens.",why:"Clostridial MYOnecrosis + marked gas/crepitus + haemolysis = gas gangrene. Necrotising fasciitis: spreads along FASCIAL planes (often polymicrobial/Group A strep), pain out of proportion."},
 {sys:"Infectious Disease",a:"HIV seroconversion illness",b:"Infectious mononucleosis",correct:"a",stem:"Fever + sore throat + lymphadenopathy + a maculopapular rash + mouth ulcers weeks after a high-risk exposure.",why:"Rash + mouth ulcers + a clear exposure history = acute HIV seroconversion (test RNA/p24). EBV mono: marked fatigue + splenomegaly + atypical lymphocytes + positive Monospot, no exposure link."}
];
const qRef = q => q.reference || (typeof q.source==="string"?q.source:"") || "Other";
const colorOf = q => (BANK.find(p=>p.id===q.packId)||{}).color || "#3fb6a8";
export function groupCounts(filterFn, keyFn){
  const total=new Map(), seen=new Map(), due=new Map(), col=new Map();
  const t=today();
  allQs().forEach(q=>{ if(filterFn && !filterFn(q)) return; const k=keyFn(q);
    total.set(k,(total.get(k)||0)+1);
    const pr=DB.progress.questions[q.id];
    if(pr) seen.set(k,(seen.get(k)||0)+1);
    if(pr&&pr.srs&&pr.srs.due&&pr.srs.due<=t) due.set(k,(due.get(k)||0)+1);
    if(!col.has(k)) col.set(k, colorOf(q));
  });
  return [...total.keys()].sort((a,b)=>a.localeCompare(b)).map(k=>({name:k,total:total.get(k),seen:seen.get(k)||0,due:due.get(k)||0,color:col.get(k)}));
}
const qType = q => (q.type==='emq' ? 'EMQs' : q.type==='sa' ? 'Short Answer' : 'MCQs');
const typeRank = t => (t==='MCQs'?0 : t==='EMQs'?1 : 2);
const listSystems    = ()         => groupCounts(null, qSys);
const listTypes      = sys        => groupCounts(q=>qSys(q)===sys, qType).sort((a,b)=>typeRank(a.name)-typeRank(b.name));
const listReferences = (sys,ty)   => groupCounts(q=>qSys(q)===sys && qType(q)===ty, qRef);
const listTopics     = (sys,ty,r) => groupCounts(q=>qSys(q)===sys && qType(q)===ty && qRef(q)===r, q=>q.topic||"General");
const poolFor = ctx => {
  if(ctx.ids) return ctx.ids.filter(id=>QMAP[id]);
  return allQs().filter(q=>{
    if(ctx.system!=null   && qSys(q)!==ctx.system)              return false;
    if(ctx.type!=null     && qType(q)!==ctx.type)               return false;
    if(ctx.reference!=null&& qRef(q)!==ctx.reference)           return false;
    if(ctx.topic!=null    && (q.topic||"General")!==ctx.topic)  return false;
    return true;
  }).map(q=>q.id);
};
function ringSVG(pct,col){ const R=20,C=2*Math.PI*R,off=C*(1-Math.min(1,Math.max(0,pct)));
  return `<svg viewBox="0 0 48 48" style="width:48px;height:48px;flex:none"><circle cx="24" cy="24" r="${R}" fill="none" stroke="var(--line)" stroke-width="5"/><circle cx="24" cy="24" r="${R}" fill="none" stroke="${col||'var(--teal)'}" stroke-width="5" stroke-linecap="round" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 24 24)"/></svg>`;
}
export function bumpStreak(){
  const s=DB.progress.streak||{current:0,lastStudied:null}, t=today();
  if(s.lastStudied!==t){ s.current = (s.lastStudied===yesterday())? s.current+1 : 1; s.lastStudied=t; }
  DB.progress.streak=s;
}
export function dailyCount(){ const d=DB.progress.daily; return (d&&d.date===today())? d.count : 0; }
export function bumpDaily(){
  const t=today(), goal=DB.settings.dailyGoal||20;
  let d=DB.progress.daily; if(!d || d.date!==t){ d={date:t,count:0,celebrated:false}; }
  d.count++;
  if(d.count>=goal && !d.celebrated){ d.celebrated=true; DB.progress.daily=d; setTimeout(()=>{ confetti(); cue("daily"); toast("Daily goal reached — "+goal+" done!"); }, 60); }
  DB.progress.daily=d;
}
export function recordAttempt(q, chosen, grade, okOverride, confidence){
  const ok = (typeof okOverride==="boolean") ? okOverride : (correctLabel(q)===chosen);
  const p = DB.progress.questions[q.id] || {seen:0,correct:0,history:[],marked:false,srs:null};
  p.seen++; if(ok)p.correct++; p.lastResult=ok?"correct":"wrong"; p.lastSeen=today();
  p.history.push({date:today(),answer:chosen,correct:ok,grade,confidence:confidence||null});
  if(grade) p.srs = schedule(p.srs, grade);
  DB.progress.questions[q.id]=p;
  bumpStreak(); bumpDaily(); save.progress();
}

/* ============================================================
   TOAST
   ============================================================ */
let toastT;
function toast(msg){
  let t=$("toast"); if(!t){ t=document.createElement("div"); t.id="toast"; t.className="toast"; document.body.appendChild(t); }
  t.textContent=msg; t.style.display="block"; clearTimeout(toastT);
  toastT=setTimeout(()=>{t.style.display="none";},1900);
}

/* ============================================================
   ISSUE REPORTING
   Prototype: stored locally + exportable.
   Production: submit as a GitHub issue (design doc §5).
   ============================================================ */
let reportType="Wrong answer";
let maintTaps=0, maintTapT;
function openReport(qid){
  closeReport();
  App.reportQid=qid; reportType="Wrong answer";
  const q=QMAP[qid];
  const types=["Wrong answer","Wrong explanation","Typo / formatting","Other"];
  const m=document.createElement("div"); m.id="modal"; m.className="modal-bg"; m.dataset.action="modal-bg";
  m.innerHTML=`<div class="modal" data-action="noop">
    <div class="row between"><b class="serif" style="font-size:19px">Report an issue</b>
      <button class="iconbtn" data-action="report-close"><svg class="i" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>
    <div class="faint" style="font-size:12.5px;margin:6px 0 14px">${esc(q.packTitle)} · ${esc(q.topic)}</div>
    <div class="faint" style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;font-weight:700;margin-bottom:8px">What's wrong?</div>
    <div class="wrapflex" id="rtypes">${types.map(t=>`<button class="btn-ghost btn-sm rtype ${t===reportType?'on':''}" data-action="report-type" data-type="${t}">${t}</button>`).join("")}</div>
    <div class="faint" style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;font-weight:700;margin:16px 0 8px">Details (optional)</div>
    <textarea class="inp" id="reporttext" placeholder="Describe the problem…" style="min-height:90px;font-family:inherit;font-size:14px"></textarea>
    <div style="height:14px"></div>
    <button class="btn btn-primary" data-action="report-submit">Send report</button>
  </div>`;
  document.body.appendChild(m);
}
function closeReport(){ const m=$("modal"); if(m) m.remove(); }

function exportJSON(obj,name){
  const b=new Blob([JSON.stringify(obj,null,2)],{type:"application/json"});
  const u=URL.createObjectURL(b), a=document.createElement("a");
  a.href=u; a.download=name; a.click(); URL.revokeObjectURL(u);
}

/* ============================================================
   RENDER ROUTER
   ============================================================ */
export function render(){
  const a=$("app");
  let foot=$("foot"); if(foot) foot.remove();
  if(App.screen==="home") a.innerHTML=viewHome();
  else if(App.screen==="bank") a.innerHTML=viewBank();
  else if(App.screen==="banksys") a.innerHTML=viewBankSystem();
  else if(App.screen==="progress") a.innerHTML=viewProgress();
  else if(App.screen==="saved") a.innerHTML=viewSaved();
  else if(App.screen==="fixes") a.innerHTML=viewFixes();
  else if(App.screen==="system") a.innerHTML=viewSystem();
  else if(App.screen==="type") a.innerHTML=viewType();
  else if(App.screen==="reference") a.innerHTML=viewReference();
  else if(App.screen==="mistakes") a.innerHTML=viewMistakes();
  else if(App.screen==="disputed") a.innerHTML=viewDisputed();
  else if(App.screen==="redflag") a.innerHTML=viewRedflag();
  else if(App.screen==="checklist") a.innerHTML=viewChecklist();
  else if(App.screen==="duel") a.innerHTML=viewDuel();
  else if(App.screen==="duelpick") a.innerHTML=viewDuelPick();
  else if(App.screen==="theme") a.innerHTML=viewTheme();
  else if(App.screen==="timer") a.innerHTML=viewTimer();
  else if(App.screen==="quiz") a.innerHTML=viewQuiz();
  else if(App.screen==="exam-builder") a.innerHTML=viewBuilder();
  else if(App.screen==="exam-runner") a.innerHTML=viewExam();
  else if(App.screen==="exam-results") a.innerHTML=viewResults();
  else if(App.screen==="celebrate") a.innerHTML=viewCelebrate();
  else if(App.screen==="search") a.innerHTML=viewSearch();
  else if(App.screen==="trophies") a.innerHTML=viewTrophies();
  else if(App.screen==="leaderboard") a.innerHTML=viewLeaderboard();
  else if(App.screen==="stats") a.innerHTML=viewStats();
  else if(App.screen==="settings") a.innerHTML=viewSettings();
  else if(App.screen==="repair") a.innerHTML=viewRepair();
  else if(App.screen==="reportsinbox") a.innerHTML=viewReportsInbox();
  else if(App.screen==="qedit") a.innerHTML=viewQEditor();
  if(App.screen==="timer" && DB.progress.timer && DB.progress.timer.running) startTimerTick(); else stopTimerTick();
  if(App.screen==="leaderboard") startBoardPoll(); else stopBoardPoll();
  const _DASH=new Set(["home","bank","banksys","progress","saved","fixes","system","type","reference","mistakes","disputed","redflag","checklist"]);
  document.body.classList.toggle("dash", _DASH.has(App.screen));
  document.body.classList.toggle("read", !_DASH.has(App.screen));
  document.body.dataset.screen=App.screen;
  syncSidebar();
  if(App.screen!==render._last){ window.scrollTo({top:0,behavior:"instant"}); render._last=App.screen; }
}
/* keep the desktop sidebar's live bits (disputed count, profile) in sync each render */
function syncSidebar(){
  const dn=document.getElementById("sideDispN"); if(dn) dn.textContent=disputedIds().length;
  const nm=(DB.settings.displayName||"Medical student");
  const sn=document.getElementById("sideName"); if(sn) sn.textContent=nm;
  const av=document.getElementById("sideAv"); if(av) av.textContent=(nm.trim()[0]||"M").toUpperCase();
}
/* 2-letter specialty code for the question-bank grid chips */
function codeOf(name){
  const M={"Surgical Special Senses":"SS","ENT & Ophthalmology":"EO","Obstetrics & Gynaecology":"OG","Haematology & Oncology":"HO","Psychiatry":"Ps","Neurology":"Ne","Dermatology":"De","Paediatrics":"Pa","Batch 37 Final":"37"};
  if(M[name]) return M[name];
  const w=String(name||"").replace(/&/g,"").split(/\s+/).filter(Boolean);
  return (((w[0]||"")[0]||"")+((w[1]||w[0]||"")[0]||"")).replace(/(.)(.)/,(m,a,b)=>a.toUpperCase()+b.toLowerCase())||"Qb";
}
/* weekly study-time bars (today highlighted) for the Progress page */
function weekBarsInner(){ const w=weekTime(),max=Math.max(1,...w.map(x=>x.sec)),DOW=["S","M","T","W","T","F","S"];
  return `<div style="display:flex;align-items:flex-end;gap:10px;height:132px">${w.map(x=>{const h=Math.round(x.sec/max*100),dt=new Date(x.d+"T00:00:00"),it=x.d===today();
    return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;height:100%;justify-content:flex-end"><div class="faint" style="font-size:9px">${x.sec?fmtHM(x.sec):""}</div><div style="width:100%;height:${Math.max(3,h)}%;min-height:4px;border-radius:7px 7px 0 0;background:${it?'var(--coral)':'var(--surface-3)'}"></div><div class="faint" style="font-size:11px;${it?'color:var(--coral);font-weight:700':''}">${DOW[dt.getDay()]}</div></div>`;}).join("")}</div>`; }

/* ---------- STUDY TIME TRACKING (YPT-style) ---------- */
let _timerTick=null;
function startTimerTick(){ if(_timerTick) return; _timerTick=setInterval(()=>{ const el=document.getElementById("timerDisp"); if(el){ el.textContent=fmtHMS(sessionElapsed()); } else { clearInterval(_timerTick); _timerTick=null; } },1000); }
function stopTimerTick(){ if(_timerTick){ clearInterval(_timerTick); _timerTick=null; } }
function fmtHMS(sec){ sec=Math.max(0,Math.floor(sec)); const h=Math.floor(sec/3600),m=Math.floor(sec%3600/60),x=sec%60; return (h?h+":"+String(m).padStart(2,"0"):String(m))+":"+String(x).padStart(2,"0"); }
function fmtHM(sec){ sec=Math.max(0,Math.floor(sec)); const h=Math.floor(sec/3600),m=Math.floor(sec%3600/60); return h?(h+"h "+(m?m+"m":"")).trim():(m+"m"); }
function timeLog(){ if(!DB.progress.timeLog) DB.progress.timeLog={}; return DB.progress.timeLog; }
function sessionElapsed(){ const t=DB.progress.timer; return (t&&t.running&&t.startedAt)? Math.floor((Date.now()-t.startedAt)/1000):0; }
function logStudy(sec,sys){ if(sec<=0) return; const L=timeLog(),d=today(); const e=L[d]||(L[d]={total:0,bySys:{}}); e.total+=sec; if(sys){ e.bySys[sys]=(e.bySys[sys]||0)+sec; } }
function studyToday(){ const e=timeLog()[today()]; return (e?e.total:0)+sessionElapsed(); }
function studyStreakDays(){ const L=timeLog(); let n=0; for(let i=0;i<400;i++){ const d=addDays(today(),-i); const has=(L[d]&&L[d].total>0)||(i===0&&sessionElapsed()>0); if(has)n++; else break; } return n; }
function weekTime(){ const L=timeLog(),out=[]; for(let i=6;i>=0;i--){ const d=addDays(today(),-i); out.push({d,sec:(L[d]?L[d].total:0)+(i===0?sessionElapsed():0)}); } return out; }
function studyBySysWindow(days){ const L=timeLog(),m={}; for(let i=0;i<days;i++){ const e=L[addDays(today(),-i)]; if(e&&e.bySys){ for(const x in e.bySys) m[x]=(m[x]||0)+e.bySys[x]; } } const t=DB.progress.timer; if(t&&t.running&&t.subject) m[t.subject]=(m[t.subject]||0)+sessionElapsed(); return m; }
function dDay(){ const ex=DB.settings.examDate; if(!ex) return null; return Math.round((new Date(ex+"T00:00:00")-new Date(today()+"T00:00:00"))/86400000); }
function fmtHrMin(sec){ sec=Math.max(0,Math.floor(sec)); const h=Math.floor(sec/3600),m=Math.floor(sec%3600/60); return h+":"+String(m).padStart(2,"0"); }
function fmtFull(sec){ sec=Math.max(0,Math.floor(sec)); const h=Math.floor(sec/3600),m=Math.floor(sec%3600/60),x=sec%60; return h+":"+String(m).padStart(2,"0")+":"+String(x).padStart(2,"0"); }
function fmtClock(ms){ if(!ms) return "\u2014"; const dt=new Date(ms); let h=dt.getHours(),m=dt.getMinutes(),ap=h<12?"AM":"PM"; h=h%12||12; return h+":"+String(m).padStart(2,"0")+" "+ap; }
function ymd(dt){ return dt.getFullYear()+"-"+String(dt.getMonth()+1).padStart(2,"0")+"-"+String(dt.getDate()).padStart(2,"0"); }
function daySessions(d){ const e=timeLog()[d]; return (e&&e.sessions)?e.sessions:[]; }
function dayTotalSec(d){ const e=timeLog()[d]; let s=e?e.total:0; if(d===today()) s+=sessionElapsed(); return s; }
function dayMaxFocus(d){ let m=daySessions(d).reduce((a,x)=>Math.max(a,x.sec||0),0); if(d===today()) m=Math.max(m,sessionElapsed()); return m; }
function dayStartEnd(d){ const ss=daySessions(d).map(x=>[x.s,x.e]); const t=DB.progress.timer; if(d===today()&&t&&t.running&&t.startedAt) ss.push([t.startedAt,Date.now()]); if(!ss.length) return [null,null]; return [Math.min(...ss.map(x=>x[0])), Math.max(...ss.map(x=>x[1]))]; }
function startTimer(){ const t=DB.progress.timer||{}; if(t.running) return; DB.progress.timer={running:true,startedAt:Date.now(),subject:t.subject||null}; save.progress(); }
function stopTimer(){ const t=DB.progress.timer; if(t&&t.running){ const endMs=Date.now(); let sec=Math.min(Math.floor((endMs-t.startedAt)/1000),6*3600); logStudy(sec,t.subject); const e=timeLog()[today()]; if(e&&sec>0){ (e.sessions||(e.sessions=[])).push({s:t.startedAt,e:endMs,sec:sec}); } } DB.progress.timer={running:false,startedAt:null,subject:t?t.subject:null}; save.progress(); }
function weekBarsHTML(){ const w=weekTime(),max=Math.max(1,...w.map(x=>x.sec)),DOW=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  return `<div class="card pad"><div style="display:flex;align-items:flex-end;gap:8px;height:118px">${w.map(x=>{ const h=Math.round(x.sec/max*100),dn=DOW[new Date(x.d+"T00:00:00").getDay()],it=x.d===today();
    return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;height:100%;justify-content:flex-end"><div class="faint" style="font-size:9px">${x.sec?fmtHM(x.sec):""}</div><div style="width:100%;height:${Math.max(2,h)}%;min-height:3px;border-radius:5px 5px 0 0;background:${it?"var(--teal)":"var(--surface-3)"}"></div><div class="faint" style="font-size:10px;${it?"color:var(--teal);font-weight:700":""}">${dn}</div></div>`; }).join("")}</div></div>`; }
function subjTimeHTML(){ const m=studyBySysWindow(7),rows=Object.entries(m).sort((a,b)=>b[1]-a[1]); if(!rows.length) return "";
  const tot=rows.reduce((a,b)=>a+b[1],0)||1;
  return `<div class="sectlabel">By subject · last 7 days</div><div class="card pad">${rows.map(([x,sec])=>`<div style="margin-bottom:10px"><div class="row between" style="font-size:13px"><span style="font-weight:600">${esc(x)}</span><span class="faint mono">${fmtHM(sec)}</span></div><div class="progressbar" style="margin-top:5px"><i style="width:${Math.round(sec/tot*100)}%"></i></div></div>`).join("")}</div>`; }
function focusTrackerHTML(){
  const sel=App.trkSel||today(), view=App.trkView||"day", mstr=App.trkMonth||sel.slice(0,7);
  const Y=+mstr.slice(0,4), M=+mstr.slice(5,7);
  const daysInMonth=new Date(Y,M,0).getDate(), first=new Date(Y,M-1,1), prevDays=new Date(Y,M-1,0).getDate();
  const WS=5; const DOW=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const ord=[]; for(let i=0;i<7;i++) ord.push((WS+i)%7);
  const lead=(first.getDay()-WS+7)%7;
  const head=ord.map(i=>`<div class="faint" style="text-align:center;font-size:11px;font-weight:600;padding-bottom:5px">${DOW[i]}</div>`).join("");
  const cbase="border-radius:9px;border:1.5px solid transparent;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:48px;gap:1px;width:100%;background:transparent;padding:0";
  let cells="";
  for(let i=lead;i>0;i--) cells+=`<div style="${cbase};opacity:.32"><span style="font-size:13px;color:var(--faint)">${prevDays-i+1}</span></div>`;
  for(let day=1;day<=daysInMonth;day++){
    const d=`${Y}-${String(M).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    const sec=dayTotalSec(d), has=sec>0, isSel=d===sel, isTod=d===today();
    let st=cbase+";cursor:pointer";
    if(has) st+=";background:rgba(199,133,71,0.30)";
    if(isTod) st+=";border-color:var(--text)";
    else if(isSel) st+=";border-color:var(--amber)";
    cells+=`<button data-action="trk-day" data-date="${d}" style="${st}"><span style="font-size:13px;font-weight:${isTod?"800":(has?"700":"500")};color:var(--text)">${day}</span>${has?`<span class="mono" style="font-size:9.5px;color:var(--amber);font-weight:700;line-height:1">${fmtHrMin(sec)}</span>`:""}</button>`;
  }
  const used=lead+daysInMonth, trail=(7-used%7)%7;
  for(let i=1;i<=trail;i++) cells+=`<div style="${cbase};opacity:.32"><span style="font-size:13px;color:var(--faint)">${i}</span></div>`;
  const monthName=first.toLocaleString("en",{month:"long",year:"numeric"});
  const tog=["day","week","month"].map(v=>{const on=v===view;return `<button data-action="trk-view" data-v="${v}" style="border:none;border-radius:18px;padding:7px 22px;font-size:13px;font-weight:600;text-transform:capitalize;cursor:pointer;${on?"background:var(--text);color:var(--ink)":"background:transparent;color:var(--faint)"}">${v}</button>`;}).join("");
  let dates=[];
  if(view==="day") dates=[sel];
  else if(view==="week"){ const off=(new Date(sel+"T00:00:00").getDay()-WS+7)%7; const start=addDays(sel,-off); for(let i=0;i<7;i++) dates.push(addDays(start,i)); }
  else { for(let day=1;day<=daysInMonth;day++) dates.push(`${Y}-${String(M).padStart(2,"0")}-${String(day).padStart(2,"0")}`); }
  let total=0,maxF=0,active=0;
  dates.forEach(d=>{ const sx=dayTotalSec(d); total+=sx; if(sx>0)active++; maxF=Math.max(maxF,dayMaxFocus(d)); });
  let label,b1,b2;
  if(view==="day"){ const se=dayStartEnd(sel);
    label=new Date(sel+"T00:00:00").toLocaleDateString("en",{weekday:"long",month:"short",day:"numeric"});
    b1=[["Total study time",fmtFull(total)],["Max focus time",fmtFull(maxF)]];
    b2=[["Start time",fmtClock(se[0])],["End time",fmtClock(se[1])]];
  } else { const avg=active?Math.round(total/active):0;
    label=view==="week"?`${new Date(dates[0]+"T00:00:00").toLocaleDateString("en",{month:"short",day:"numeric"})} – ${new Date(dates[6]+"T00:00:00").toLocaleDateString("en",{month:"short",day:"numeric"})}`:monthName;
    b1=[["Total study time",fmtFull(total)],["Max focus time",fmtFull(maxF)]];
    b2=[["Daily average",fmtFull(avg)],["Active days",String(active)]];
  }
  const cell=(L,V)=>`<div style="flex:1;text-align:center;padding:4px 2px"><div style="font-size:12px;color:var(--amber);font-weight:600">${L}</div><div class="mono" style="font-size:23px;font-weight:800;margin-top:6px;color:var(--text)">${V}</div></div>`;
  return `
    <div class="sectlabel" style="margin-top:18px">Focus time</div>
    <div class="card pad">
      <div class="row between" style="margin-bottom:9px">
        <button class="iconbtn" data-action="trk-month" data-delta="-1"><svg class="i" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>
        <b style="font-size:14px">${monthName}</b>
        <button class="iconbtn" data-action="trk-month" data-delta="1"><svg class="i" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg></button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px">${head}</div>
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px">${cells}</div>
    </div>
    <div class="row" style="gap:6px;justify-content:center;margin:14px 0 10px">${tog}</div>
    <div style="text-align:center;font-weight:700;font-size:15px;margin-bottom:10px">${label}</div>
    <div class="card pad">
      <div class="row">${b1.map(x=>cell(x[0],x[1])).join("")}</div>
      <div style="height:1px;background:var(--surface-3);margin:10px 0"></div>
      <div class="row">${b2.map(x=>cell(x[0],x[1])).join("")}</div>
    </div>`;
}
function viewTimer(){
  const t=DB.progress.timer||{}, running=!!t.running;
  const subs=["General",...listSystems().map(z=>z.name)];
  const tod=studyToday(), wk=weekTime().reduce((a,b)=>a+b.sec,0), streak=studyStreakDays(), dd=dDay();
  const bySys=(timeLog()[today()]||{}).bySys||{};
  const subjSec=sub=>(bySys[sub]||0)+(running&&t.subject===sub?sessionElapsed():0);
  let html=`<div class="fade">
    <button class="btn-sm btn-ghost" data-action="nav" data-screen="home" style="margin-bottom:14px"><svg class="i" viewBox="0 0 24 24" style="width:15px;height:15px"><path d="M15 18l-6-6 6-6"/></svg> Home</button>
    <h2 class="serif" style="font-size:24px;font-weight:600">⏱️ Study timer</h2>
    <p class="muted" style="font-size:13.5px;margin-top:2px">${dd!=null?`Exam in <b>${dd>0?dd:0}</b> day${dd===1?"":"s"} · `:""}tap a subject to start the clock.</p>
    <div class="card pad" style="text-align:center;padding:24px 16px;margin-top:10px;${running?"border:1px solid var(--teal-dim)":""}">
      <div class="faint" style="font-size:11px;letter-spacing:.12em;text-transform:uppercase">${running?("Studying · "+esc(t.subject||"General")):"Total studied today"}</div>
      <div id="timerDisp" class="mono" style="font-size:46px;font-weight:800;letter-spacing:1px;margin:8px 0">${running?fmtHMS(sessionElapsed()):fmtHMS(tod)}</div>
      ${running?`<button class="btn btn-ghost" data-action="timer-toggle" data-s="${esc(t.subject||"General")}">Stop & save</button>`:`<div class="faint" style="font-size:12px">${streak} day streak · keep it going</div>`}
    </div>
    <div class="sectlabel">Subjects · tap to start</div>`;
  subs.forEach(sub=>{
    const isRun=running&&t.subject===sub, sec=subjSec(sub);
    html+=`<button class="card pad subj" data-action="timer-toggle" data-s="${esc(sub)}" style="width:100%;margin-bottom:8px;${isRun?"border-left:3px solid var(--teal);background:var(--teal-deep)":""}">
      <div class="row between">
        <div class="row" style="gap:11px"><span style="font-size:16px;line-height:1">${isRun?"⏸️":"▶️"}</span><span style="font-weight:600;font-size:14.5px">${esc(sub)}</span></div>
        <span class="mono" style="font-size:14px;${isRun?"color:var(--teal);font-weight:700":"color:var(--faint)"}">${sec?fmtHM(sec):"—"}</span>
      </div>
    </button>`;
  });
  html+=`<div class="stat3 stagger" style="margin-top:14px">
      <div class="card"><div class="n teal">${fmtHM(tod)}</div><div class="l">Today</div></div>
      <div class="card"><div class="n amber">${streak}</div><div class="l">Day streak</div></div>
      <div class="card"><div class="n green">${fmtHM(wk)}</div><div class="l">This week</div></div>
    </div>
    ${focusTrackerHTML()}
    ${subjTimeHTML()}
  </div>`;
  return html;
}
/* ---------- HOME ---------- */
function notifPromptDue(){ const N=notifCfg(); return notifSupported() && notifPermission()==="default" && !N.enabled && !N.prompted; }
function viewHome(){
  const totalQ=Object.keys(QMAP).length;
  const totalSeen=Object.keys(DB.progress.questions).length;
  const allDue=dueCount();
  const streak=DB.progress.streak?.current||0;
  let html=`<div class="fade">`;

  // maintainer fix announcement — shared to everyone via the edits feed
  if(App.fixAlert && App.fixAlert.ids && App.fixAlert.ids.length){
    const _fn=App.fixAlert.ids.length;
    html+=`<div class="card pad" style="margin-bottom:14px;border:1px solid var(--green);background:var(--green-deep)">
      <div class="row" style="gap:11px;align-items:flex-start"><span style="font-size:20px;line-height:1">\u{1F527}</span>
      <div style="flex:1"><div style="font-weight:700;font-size:15px;color:var(--green)">${_fn} reported question${_fn>1?'s':''} just fixed</div>
      <div class="faint" style="font-size:12.5px;margin-top:2px">The answer key was updated to match standard teaching — see what changed.</div>
      <div class="row" style="gap:8px;margin-top:11px">
        <button class="btn-sm btn-primary" data-action="view-fixes" style="width:auto">Review ${_fn>1?'them':'it'}</button>
        <button class="btn-sm btn-ghost" data-action="dismiss-fixes" style="width:auto">Dismiss</button>
      </div></div></div>
    </div>`;
  }

  // level + streak banner
  const xp=DB.progress.xp||0, lvl=levelOf(xp), inLvl=xpInLevel(xp);
  const flame=`<svg viewBox="0 0 24 24"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>`;
  html+=`<div class="levelcard">
    <div class="row between">
      <div class="row" style="gap:11px">
        <div class="lvlbadge">${lvl}</div>
        <div><div style="font-weight:700;font-size:15px">Level ${lvl}</div><div class="faint" style="font-size:12px">${inLvl} / 200 XP</div></div>
      </div>
      <div class="streakpill">${flame}${streak}</div>
    </div>
    <div class="progressbar" style="margin-top:11px"><i style="width:${inLvl/200*100}%"></i></div>
  </div>`;

  // mobile-only quick nav to the desktop-sidebar destinations
  html+=`<div class="mobonly" style="display:flex;gap:8px;margin-bottom:14px">
    <button class="btn btn-ghost btn-sm" data-action="nav" data-screen="bank" style="flex:1">Question bank</button>
    <button class="btn btn-ghost btn-sm" data-action="nav" data-screen="progress" style="flex:1">Progress</button>
    <button class="btn btn-ghost btn-sm" data-action="nav" data-screen="saved" style="flex:1">Saved</button>
  </div>`;

  // first-run reminders prompt (dismissible)
  if(notifPromptDue()){
    html+=`<div class="card pad" style="margin-bottom:14px;border-left:3px solid var(--teal)">
      <div class="row" style="gap:11px;align-items:flex-start">
        <span style="font-size:20px;line-height:1">&#128276;</span>
        <div style="flex:1">
          <div style="font-weight:700;font-size:15px">Turn on study reminders?</div>
          <div class="faint" style="font-size:12.5px;margin-top:2px">A gentle daily nudge so due cards and your streak don't slip. Fine-tune what and when in Settings.</div>
          <div class="row" style="gap:8px;margin-top:10px">
            <button class="btn-sm btn-primary" data-action="notif-prompt-enable">Turn on</button>
            <button class="btn-sm btn-ghost" data-action="notif-prompt-dismiss">Not now</button>
          </div>
        </div>
      </div>
    </div>`;
  }

  if(DB.settings.maintainer && unreadReports()>0){
    html+=`<button class="card pad subj" data-action="open-reports-inbox" style="width:100%;margin-bottom:14px;border-left:3px solid var(--amber)">
      <div class="row between"><div class="row" style="gap:11px"><span style="font-size:20px;line-height:1">&#128681;</span>
      <div style="text-align:left"><div style="font-weight:700;font-size:15px">${unreadReports()} new report${unreadReports()>1?'s':''}</div><div class="faint" style="font-size:12.5px">tap to review &amp; fix questions</div></div></div>
      <svg class="i" viewBox="0 0 24 24" style="width:22px;height:22px;stroke:var(--amber)"><path d="M9 6l6 6-6 6"/></svg></div></button>`;
  }
  // D-day countdown + study-timer entry (YPT)
  { const _dd=dDay(), _st=studyToday();
    html+=`<button class="card pad subj" data-action="open-timer" style="width:100%;margin-bottom:14px;border-left:3px solid var(--amber)">
      <div class="row between"><div class="row" style="gap:11px"><span style="font-size:21px;line-height:1">⏱️</span>
      <div style="text-align:left">${_dd!=null?`<div style="font-weight:700;font-size:15px">${_dd>0?"D-"+_dd:_dd===0?"D-Day — exam today!":"exam "+(-_dd)+"d ago"}</div><div class="faint" style="font-size:12.5px">${_dd>0?"days to your exam · tap to study":_dd===0?"good luck!":"set a new exam date in settings"}</div>`:`<div style="font-weight:700;font-size:15px">Study timer</div><div class="faint" style="font-size:12.5px">track real study time · set an exam date for a D-day</div>`}</div></div>
      <div class="mono" style="color:var(--teal);text-align:right">${_st>0?fmtHM(_st):"⏱️"}<div class="faint" style="font-size:10px;font-weight:600">${_st>0?"today":"start"}</div></div></div>
    </button>`; }

  // daily goal ring
  const dc=dailyCount(), goal=DB.settings.dailyGoal||20, dpct=goal?dc/goal:0, done=dc>=goal;
  html+=`<div class="card pad" style="margin-bottom:14px"><div class="row" style="gap:14px">
    ${ringSVG(dpct, done?'var(--green)':'var(--teal)')}
    <div style="flex:1"><div style="font-weight:700;font-size:15px">Daily goal</div><div class="faint" style="font-size:12.5px;margin-top:1px">${dc} / ${goal} today${done?' · reached!':''}</div></div>
  </div></div>`;

  html+=`<div class="stat3 stagger">
    <div class="card"><div class="n teal">${allDue}</div><div class="l">Due today</div></div>
    <div class="card"><div class="n amber">${streak}</div><div class="l">Day streak</div></div>
    <div class="card"><div class="n green">${totalSeen}/${totalQ}</div><div class="l">Seen</div></div>
  </div>`;

  // in-progress sessions — resume across subjects without losing progress
  { const _sv=Object.values((DB.progress.sessions||{})).filter(x=>x&&x.ctx&&!x.ctx.smart&&poolFor(x.ctx).length).sort((a,b)=>(b.savedAt||0)-(a.savedAt||0));
    if(_sv.length){
      html+=`<div class="sectlabel">Continue studying</div>`;
      _sv.forEach(x=>{ const _tot=x.total||poolFor(x.ctx).length, _k=esc(JSON.stringify(x.ctx));
        html+=`<button class="card pad subj" data-action="resume-session" data-key="${_k}" style="width:100%;margin-bottom:8px;border-left:3px solid var(--teal)">
          <div class="row between"><div class="row" style="gap:11px"><span style="font-size:17px;line-height:1;color:var(--teal)">\u25B6</span>
          <div style="text-align:left"><div style="font-weight:700;font-size:14.5px">${esc(x.label||"Session")}</div>
          <div class="faint" style="font-size:12.5px">Question ${(x.i||0)+1} of ${_tot}${x.answered?` \u00b7 ${x.correct}/${x.answered} right so far`:""}</div></div></div>
          <span class="iconbtn" data-action="drop-session" data-key="${_k}" title="Remove" style="width:30px;height:30px;font-size:13px">\u2715</span></div></button>`;
      });
    }
  }
  // suggestions — "what should I study?"
  const sugg=computeSuggestions();
  html+=`<div class="sectlabel">What should I study?</div>`;
  sugg.forEach(s=>{
    const act = s.action==="topic"
      ? `data-action="study-topic" data-system="${esc(s.data.system)}" data-reference="${esc(s.data.reference)}" data-topic="${esc(s.data.topic)}"`
      : s.action==="none" ? '' : `data-action="${s.action}"`;
    const tag = s.action==="none" ? "div" : "button";
    html+=`<${tag} class="card pad sugg" ${act} style="margin-bottom:9px;width:100%;text-align:left">
      <div class="row" style="gap:12px">
        <span class="suggicon">${s.icon}</span>
        <div style="flex:1"><div style="font-weight:700;font-size:14.5px">${esc(s.title)}</div>${s.sub?`<div class="faint" style="font-size:12.5px;margin-top:1px">${esc(s.sub)}</div>`:''}</div>
        ${s.action!=="none"?`<svg class="i" viewBox="0 0 24 24" style="width:18px;height:18px;stroke:var(--teal)"><path d="M9 6l6 6-6 6"/></svg>`:''}
      </div>
    </${tag}>`;
  });

  const newAvail=totalQ-totalSeen;
  const _mc=mistakeIds().length;
  if(_mc>0) html+=`<button class="card pad subj" data-action="open-mistakes" style="width:100%;margin-bottom:11px;border-left:3px solid var(--red)">
    <div class="row between"><div class="row" style="gap:11px"><span style="font-size:21px;line-height:1">\u{1F525}</span>
    <div style="text-align:left"><div style="font-weight:700;font-size:15px">Fix my mistakes</div>
    <div class="faint" style="font-size:12.5px">${_mc} question${_mc>1?'s':''} you've missed · tap to drill</div></div></div>
    <svg class="i" viewBox="0 0 24 24" style="stroke:var(--red);width:22px;height:22px"><path d="M9 6l6 6-6 6"/></svg></div></button>`;
  const _dc=disputedIds().length;
  if(_dc>0) html+=`<button class="card pad subj" data-action="open-disputed" style="width:100%;margin-bottom:11px;border-left:3px solid var(--amber)">
    <div class="row between"><div class="row" style="gap:11px"><span style="font-size:21px;line-height:1">⚖️</span>
    <div style="text-align:left"><div style="font-weight:700;font-size:15px">Disputed answers</div>
    <div class="faint" style="font-size:12.5px">${_dc} flagged · file answer vs standard teaching</div></div></div>
    <svg class="i" viewBox="0 0 24 24" style="stroke:var(--amber);width:22px;height:22px"><path d="M9 6l6 6-6 6"/></svg></div></button>`;
  const _rf=redFlagIds().length;
  if(_rf>0) html+=`<button class="card pad subj" data-action="open-redflag" style="width:100%;margin-bottom:11px;border-left:3px solid var(--red)">
    <div class="row between"><div class="row" style="gap:11px"><span style="font-size:21px;line-height:1">\u{1F6A8}</span>
    <div style="text-align:left"><div style="font-weight:700;font-size:15px">Red-flag drills</div>
    <div class="faint" style="font-size:12.5px">${_rf} can't-miss emergencies · missing these changes management</div></div></div>
    <svg class="i" viewBox="0 0 24 24" style="stroke:var(--red);width:22px;height:22px"><path d="M9 6l6 6-6 6"/></svg></div></button>`;
  html+=`<button class="card pad subj" data-action="open-checklist" style="width:100%;margin-bottom:11px;border-left:3px solid var(--teal)">
    <div class="row between"><div class="row" style="gap:11px"><span style="font-size:21px;line-height:1">\u{1F4CB}</span>
    <div style="text-align:left"><div style="font-weight:700;font-size:15px">Before-exam checklist</div>
    <div class="faint" style="font-size:12.5px">Must-know patterns per subject · tick &amp; drill</div></div></div>
    <svg class="i" viewBox="0 0 24 24" style="stroke:var(--teal);width:22px;height:22px"><path d="M9 6l6 6-6 6"/></svg></div></button>`;
  html+=`<button class="card pad subj" data-action="open-duelpick" style="width:100%;margin-bottom:11px;border-left:3px solid var(--purple, #b58fce)">
    <div class="row between"><div class="row" style="gap:11px"><span style="font-size:21px;line-height:1">⚔️</span>
    <div style="text-align:left"><div style="font-weight:700;font-size:15px">Wrong Answer Duel</div>
    <div class="faint" style="font-size:12.5px">${DUELS.length} confused pairs · by division · pick the stronger answer</div></div></div>
    <svg class="i" viewBox="0 0 24 24" style="stroke:#b58fce;width:22px;height:22px"><path d="M9 6l6 6-6 6"/></svg></div></button>`;
  html+=`<div class="sectlabel">Recall</div>
  <button class="card pad subj" data-action="start-smart" style="width:100%">
    <div class="row between">
      <div><h3 style="font-size:18px">Smart Review</h3>
      <div class="muted" style="font-size:13.5px;margin-top:2px">${allDue} due + up to ${Math.min(DB.settings.newPerDay,newAvail)} new · interleaved</div></div>
      <svg class="i" viewBox="0 0 24 24" style="stroke:var(--teal);width:24px;height:24px"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v5h-5"/></svg>
    </div>
  </button>
  <div style="height:10px"></div>
  <button class="card pad subj" data-action="start-cram" style="width:100%;border-left:3px solid var(--amber)">
    <div class="row between">
      <div class="row" style="gap:11px"><span style="font-size:21px;line-height:1">⏰</span>
      <div style="text-align:left"><div style="font-weight:700;font-size:15px">Exam tomorrow?</div>
      <div class="faint" style="font-size:12.5px">Cram mode — your highest-yield questions, hardest first</div></div></div>
      <svg class="i" viewBox="0 0 24 24" style="stroke:var(--amber);width:22px;height:22px"><path d="M9 6l6 6-6 6"/></svg>
    </div>
  </button>
  <div style="height:10px"></div>
  <button class="btn btn-ghost" data-action="nav" data-screen="exam-builder">
    <svg class="i" viewBox="0 0 24 24"><path d="M12 6v6l4 2"/><circle cx="12" cy="12" r="9"/></svg> Exam Simulation
  </button>
  <div class="row" style="gap:10px;margin-top:10px">
    <button class="btn btn-ghost" data-action="nav" data-screen="trophies" style="flex:1"><svg class="i" viewBox="0 0 24 24"><path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0zM7 4H4v2a3 3 0 0 0 3 3M17 4h3v2a3 3 0 0 1-3 3"/></svg> Achievements</button>
    <button class="btn btn-ghost" data-action="nav" data-screen="leaderboard" style="flex:1"><svg class="i" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></svg> Leaderboard</button>
  </div>`;

  // browse by stage -> subject
  const EMOJI={"Ophthalmology":"\u{1F441}️","ENT":"\u{1F442}","Dermatology":"\u{1F9F4}","Haematology & Oncology":"\u{1FA78}","Neurology":"\u{1F9E0}","Psychiatry":"\u{1F6CB}️","Obstetrics & Gynaecology":"\u{1F930}","Paediatrics":"\u{1F9D2}"};
  const sys=listSystems();
  if(!sys.length) html+=`<div class="empty">No questions loaded yet — pull to sync.</div>`;
  const stageMap={};
  sys.forEach(s=>{ const q=allQs().find(x=>qSys(x)===s.name); const st=q?qStage(q):"5th Stage"; (stageMap[st]=stageMap[st]||[]).push(s); });
  Object.keys(stageMap).sort().forEach(stage=>{
    const list=stageMap[stage], tot=list.reduce((n,s)=>n+s.total,0);
    const collapsed=App.collapsedStages[stage]!==false;
    html+=`<button class="stagebar" data-action="toggle-stage" data-stage="${esc(stage)}" style="width:100%;background:var(--surface-2);border:1px solid var(--line);border-radius:14px;color:inherit;text-align:left;padding:14px 16px;margin:22px 0 12px;cursor:pointer;box-shadow:var(--shadow)">
      <div class="row" style="gap:11px;margin:0">
      <span style="font-size:23px;line-height:1">\u{1F393}</span>
      <div style="flex:1"><div class="serif" style="font-size:20px;font-weight:600">${esc(stage)}</div>
      <div class="faint" style="font-size:11.5px;margin-top:1px">${list.length} subjects · ${tot} questions · ${collapsed?'tap to expand':"let's get you through finals"}</div></div>
      <svg class="i" viewBox="0 0 24 24" style="width:20px;height:20px;flex:none;transition:transform .2s;transform:rotate(${collapsed?'-90deg':'0deg'})"><path d="M6 9l6 6 6-6"/></svg>
    </div></button>`;
    if(!collapsed) list.forEach(s=>{
      const pct=s.total?Math.round(s.seen/s.total*100):0, em=EMOJI[s.name]||"\u{1F4D8}";
      html+=`<button class="card pad subj" data-action="open-system" data-system="${esc(s.name)}" style="margin-bottom:10px;border-left:3px solid ${s.color}">
        <div class="row between">
          <div class="row" style="gap:10px"><span style="font-size:21px;line-height:1">${em}</span><h3 style="color:${s.color}">${esc(s.name)}</h3></div>
          ${s.due>0?`<span class="badge due">${s.due} due</span>`:`<span class="badge zero">${s.seen}/${s.total}</span>`}
        </div>
        <div class="row" style="gap:10px;margin-top:8px;font-size:12.5px;color:var(--faint)">
          <span>${s.total} questions</span><span>·</span><span>${listTypes(s.name).map(t=>t.name).join(' + ')}</span>
        </div>
        <div class="progressbar"><i style="width:${pct}%"></i></div>
      </button>`;
    });
  });
  html+=`</div>`;
  return html;
}

/* ---------- BROWSE: references within a system ---------- */
function viewSystem(){
  const sys=App.nav.system, types=listTypes(sys);
  const sysColor=(listSystems().find(s=>s.name===sys)||{}).color||"#3fb6a8";
  let html=`<div class="fade">
    <button class="btn-sm btn-ghost" data-action="nav" data-screen="home" style="margin-bottom:14px"><svg class="i" viewBox="0 0 24 24" style="width:15px;height:15px"><path d="M15 18l-6-6 6-6"/></svg> Home</button>
    <h2 class="serif" style="font-size:24px;font-weight:600;color:${sysColor}">${esc(sys)}</h2>
    <p class="muted" style="font-size:13.5px;margin-top:2px">${poolFor({system:sys}).length} questions</p>
    <div style="height:10px"></div>
    <button class="btn btn-primary" data-action="study-system" data-system="${esc(sys)}">Study everything in ${esc(sys)}</button>
    <div style="height:8px"></div>
    <button class="btn btn-ghost btn-sm" data-action="export-anki-system" data-system="${esc(sys)}"><svg class="i" viewBox="0 0 24 24" style="width:15px;height:15px"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg> Export ${esc(sys)} to Anki</button>
    <div class="sectlabel">Question type</div>`;
  types.forEach(t=>{
    const pct=t.total?Math.round(t.seen/t.total*100):0;
    html+=`<button class="card pad subj" data-action="open-type" data-system="${esc(sys)}" data-type="${esc(t.name)}" style="margin-bottom:10px">
      <div class="row between"><h3 style="font-size:17px">${esc(t.name)}</h3>${t.due>0?`<span class="badge due">${t.due} due</span>`:`<span class="badge zero">${t.seen}/${t.total}</span>`}</div>
      <div class="row" style="gap:14px;margin-top:7px;font-size:12.5px;color:var(--faint)"><span>${t.total} questions</span><span>·</span><span>${listReferences(sys,t.name).length} references</span></div>
      <div class="progressbar"><i style="width:${pct}%"></i></div>
    </button>`;
  });
  html+=`</div>`;
  return html;
}

/* ---------- BROWSE: references within a system + type ---------- */
function viewType(){
  const sys=App.nav.system, ty=App.nav.type, refs=listReferences(sys,ty);
  const sysColor=(listSystems().find(s=>s.name===sys)||{}).color||"#3fb6a8";
  let html=`<div class="fade">
    <button class="btn-sm btn-ghost" data-action="open-system" data-system="${esc(sys)}" style="margin-bottom:14px"><svg class="i" viewBox="0 0 24 24" style="width:15px;height:15px"><path d="M15 18l-6-6 6-6"/></svg> ${esc(sys)}</button>
    <div class="faint mono" style="font-size:11px;letter-spacing:.08em;text-transform:uppercase">${esc(sys)}</div>
    <h2 class="serif" style="font-size:22px;font-weight:600;color:${sysColor};margin-top:2px">${esc(ty)}</h2>
    <p class="muted" style="font-size:13.5px;margin-top:2px">${refs.length} references · ${poolFor({system:sys,type:ty}).length} questions</p>
    <div style="height:10px"></div>
    <button class="btn btn-primary" data-action="study-type" data-system="${esc(sys)}" data-type="${esc(ty)}">Study all ${esc(ty)} in ${esc(sys)}</button>
    <div class="sectlabel">References</div>`;
  refs.forEach(r=>{
    const pct=r.total?Math.round(r.seen/r.total*100):0;
    html+=`<button class="card pad subj" data-action="open-reference" data-system="${esc(sys)}" data-type="${esc(ty)}" data-reference="${esc(r.name)}" style="margin-bottom:10px">
      <div class="row between"><h3 style="font-size:16px">${esc(r.name)}</h3>${r.due>0?`<span class="badge due">${r.due} due</span>`:`<span class="badge zero">${r.seen}/${r.total}</span>`}</div>
      <div class="row" style="gap:14px;margin-top:7px;font-size:12.5px;color:var(--faint)"><span>${r.total} questions</span><span>·</span><span>${listTopics(sys,ty,r.name).length} topics</span></div>
      <div class="progressbar"><i style="width:${pct}%"></i></div>
    </button>`;
  });
  html+=`</div>`;
  return html;
}

/* ---------- BROWSE: topics within a reference ---------- */
function viewReference(){
  const sys=App.nav.system, ty=App.nav.type, ref=App.nav.reference, tops=listTopics(sys,ty,ref);
  let html=`<div class="fade">
    <button class="btn-sm btn-ghost" data-action="open-type" data-system="${esc(sys)}" data-type="${esc(ty)}" style="margin-bottom:14px"><svg class="i" viewBox="0 0 24 24" style="width:15px;height:15px"><path d="M15 18l-6-6 6-6"/></svg> ${esc(ty)}</button>
    <div class="faint mono" style="font-size:11px;letter-spacing:.08em;text-transform:uppercase">${esc(sys)} · ${esc(ty)}</div>
    <h2 class="serif" style="font-size:21px;font-weight:600;margin-top:2px">${esc(ref)}</h2>
    <p class="muted" style="font-size:13.5px;margin-top:2px">${tops.length} topics · ${poolFor({system:sys,reference:ref}).length} questions</p>
    <div style="height:10px"></div>
    <button class="btn btn-primary" data-action="study-reference" data-system="${esc(sys)}" data-type="${esc(ty)}" data-reference="${esc(ref)}">Study all of this reference</button>
    <div class="sectlabel">Topics</div>`;
  tops.forEach(tp=>{
    const pct=tp.total?Math.round(tp.seen/tp.total*100):0;
    html+=`<button class="card pad subj" data-action="${ty==='EMQs'?'open-theme':'study-topic'}" data-system="${esc(sys)}" data-type="${esc(ty)}" data-reference="${esc(ref)}" data-topic="${esc(tp.name)}" style="margin-bottom:9px">
      <div class="row between"><span style="font-weight:600;font-size:14.5px">${esc(tp.name)}</span>${tp.due>0?`<span class="badge due">${tp.due}</span>`:`<span class="faint mono" style="font-size:12px">${tp.seen}/${tp.total}</span>`}</div>
      <div class="progressbar" style="margin-top:9px"><i style="width:${pct}%"></i></div>
    </button>`;
  });
  html+=`</div>`;
  return html;
}

/* ---------- MISTAKE NOTEBOOK ---------- */
function viewTheme(){
  const T=App.theme;
  const ids=poolFor({system:T.sys, type:T.ty, reference:T.reference, topic:T.topic});
  const cases=ids.map(id=>QMAP[id]).filter(Boolean);
  const fp=!!T.fromPractice;
  const back = fp
    ? `<button class="btn-sm btn-ghost" data-action="end-practice" style="margin-bottom:12px"><svg class="i" viewBox="0 0 24 24" style="width:15px;height:15px"><path d="M15 18l-6-6 6-6"/></svg> Exit</button>`
    : `<button class="btn-sm btn-ghost" data-action="open-reference" data-system="${esc(T.sys)}" data-type="${esc(T.ty)}" data-reference="${esc(T.reference)}" style="margin-bottom:12px"><svg class="i" viewBox="0 0 24 24" style="width:15px;height:15px"><path d="M15 18l-6-6 6-6"/></svg> ${esc(T.reference)}</button>`;
  if(!cases.length) return `<div class="fade">${back}<div class="empty">No cases in this theme.</div></div>`;
  const opts=cases[0].choices||[]; const oc=T.optsCollapsed;
  const done=cases.filter((q,i)=>T.revealed[i]).length;
  let html=`<div class="fade">${back}
    <div class="faint mono" style="font-size:11px;letter-spacing:.08em;text-transform:uppercase">${esc(T.sys)} · EMQ theme</div>
    <h2 class="serif" style="font-size:21px;font-weight:600;margin-top:2px">${esc(T.topic)}</h2>
    <p class="muted" style="font-size:13.5px;margin-top:2px">${cases.length} cases · pick from the shared list · ${done}/${cases.length} revealed</p>
    <button class="optshdr" data-action="theme-toggle-opts" style="width:100%;background:none;border:none;color:inherit;font:inherit;text-align:left;cursor:pointer;display:flex;align-items:center;justify-content:space-between;margin-top:6px"><span>Option list · ${opts.length} options</span><svg class="chev i" viewBox="0 0 24 24" style="width:18px;height:18px;flex:none;transition:transform .2s;transform:rotate(${oc?'-90deg':'0deg'})"><path d="M6 9l6 6 6-6"/></svg></button>
    <div id="themeOptsBox" style="overflow:hidden;transition:max-height .3s ease;max-height:${oc?'0':'2000px'}"><div class="card pad" style="margin:6px 0 14px;border-left:3px solid var(--teal)">${opts.map(o=>`<div style="padding:4px 0;font-size:13.5px"><b style="color:var(--teal)">${o.l}.</b> ${esc(o.t)}</div>`).join("")}</div></div>`;
  const chipS=(state)=>{ let bg="var(--surface-2)",bd="var(--line)",co="inherit";
    if(state==="ok"){bg="var(--green)";co="#04211e";bd="var(--green)";}
    else if(state==="bad"){bg="var(--red-deep,#3a1f24)";co="var(--red)";bd="#6e2b30";}
    else if(state==="sel"){bd="var(--teal)";bg="rgba(63,182,168,.14)";}
    return `display:inline-grid;place-items:center;width:34px;height:34px;border-radius:8px;border:1px solid ${bd};background:${bg};color:${co};font-weight:700;font-size:13px;cursor:pointer`; };
  cases.forEach((q,ci)=>{
    const rv=!!T.revealed[ci], pick=T.picks[ci], cl=correctLabel(q);
    html+=`<div class="card pad" style="margin-bottom:12px">
      <div class="row between" style="margin-bottom:6px"><span class="mono faint" style="font-size:12px">Case ${ci+1}</span>${rv?(pick===cl?'<span class="pill" style="color:var(--green)">✓ correct</span>':(pick?'<span class="pill" style="color:var(--red)">✗ missed</span>':'')):''}</div>
      <div class="serif" style="font-size:15px;line-height:1.5">${rv?q.stem:stripBold(q.stem)}</div>
      <div class="wrapflex" style="margin-top:10px;gap:7px">`;
    q.choices.forEach(c=>{ let st=""; if(rv){ if(c.correct)st="ok"; else if(pick===c.l)st="bad"; } else if(pick===c.l)st="sel";
      html+=`<button ${rv?"":`data-action="theme-pick" data-i="${ci}" data-label="${c.l}"`} style="${chipS(st)}">${c.l}</button>`; });
    html+=`</div>`;
    if(!rv){ html+=`<div style="margin-top:11px"><button class="btn-sm btn-primary" data-action="theme-reveal" data-i="${ci}">Reveal answer</button></div>`; }
    else {
      const cc=q.choices.find(c=>c.correct);
      html+=`<div class="ansbox" style="margin-top:11px"><div class="k">Answer</div><div class="v">${cc.l} — ${esc(cc.t)}</div></div>`;
      if(cc.e) html+=`<div class="exp" style="margin-top:9px">${cc.e}</div>`;
      const wn=q.choices.filter(c=>!c.correct&&c.e).slice(0,3);
      if(wn.length){ html+=`<div class="ttl" style="margin:12px 0 4px">Why not the closest answers</div>`;
        wn.forEach(c=>{ html+=`<div style="margin-top:7px"><b>${c.l}. ${esc(c.t)}</b><div class="exp" style="margin-top:2px">${c.e}</div></div>`; }); }
      if(q.keyPoint) html+=`<div class="keypoint" style="margin-top:11px"><div class="k">KEY POINT</div><div class="v">${esc(q.keyPoint)}</div></div>`;
    }
    html+=`</div>`;
  });
  if(T.fromPractice) html+=`<button class="btn btn-primary" data-action="theme-continue" style="width:100%;margin-top:4px">Continue &rarr;</button>`;
  html+=`</div>`; return html;
}
function viewDuelPick(){
  const counts={}; DUELS.forEach(d=>counts[d.sys]=(counts[d.sys]||0)+1);
  const cats=Object.keys(counts).sort();
  let html=`<div class="fade">
    <button class="btn-sm btn-ghost" data-action="nav" data-screen="home" style="margin-bottom:14px"><svg class="i" viewBox="0 0 24 24" style="width:15px;height:15px"><path d="M15 18l-6-6 6-6"/></svg> Home</button>
    <h2 class="serif" style="font-size:24px;font-weight:600">⚔️ Wrong Answer Duel</h2>
    <p class="muted" style="font-size:13.5px;margin-top:2px">Pick the stronger answer between two commonly-confused options. Choose a division, or duel them all.</p>
    <button class="card pad subj" data-action="start-duel" style="width:100%;margin:10px 0;border-left:3px solid #b58fce">
      <div class="row between"><div class="row" style="gap:11px"><span style="font-size:20px">🎲</span><div style="text-align:left"><div style="font-weight:700;font-size:15px">All divisions</div><div class="faint" style="font-size:12.5px">${DUELS.length} pairs · shuffled</div></div></div>
      <svg class="i" viewBox="0 0 24 24" style="width:22px;height:22px;stroke:#b58fce"><path d="M9 6l6 6-6 6"/></svg></div></button>
    <div class="sectlabel">Divisions</div>`;
  cats.forEach(c=>{ html+=`<button class="card pad subj" data-action="start-duel" data-cat="${esc(c)}" style="width:100%;margin-bottom:8px">
    <div class="row between"><span style="font-weight:600;font-size:14.5px">${esc(c)}</span><span class="badge zero">${counts[c]} pair${counts[c]>1?'s':''}</span></div></button>`; });
  html+=`</div>`; return html;
}
function viewDuel(){
  const D=App.duel; const d=DUELS[D.order[D.i]];
  let html=`<div class="fade">
    <div class="row between" style="margin-bottom:6px">
      <button class="btn-sm btn-ghost" data-action="duel-done"><svg class="i" viewBox="0 0 24 24" style="width:15px;height:15px"><path d="M15 18l-6-6 6-6"/></svg> Exit</button>
      <span class="mono faint" style="font-size:13px">${D.i+1} / ${D.order.length}</span>
      <span class="streakpill">⚔️ ${D.score}</span>
    </div>
    <div class="progressbar" style="margin-bottom:16px"><i style="width:${D.i/D.order.length*100}%"></i></div>
    <div class="qmeta"><span class="pill">${esc(d.sys)}</span><span class="pill emqtag">Duel</span></div>
    <div class="stem serif" style="font-family:inherit">${esc(d.stem)}</div>
    <div class="optshdr">Which one fits — pick the stronger answer</div>
    <div class="choices">`;
  (D.flip?["b","a"]:["a","b"]).forEach((side,_pos)=>{
    let cls="choice", vd="";
    if(D.revealed){ if(side===d.correct){ cls+=" correct"; vd=`<span class="vd">CORRECT</span>`; } else if(D.picked===side){ cls+=" wrong"; vd=`<span class="vd">YOUR PICK</span>`; } }
    else if(D.picked===side) cls+=" sel";
    html+=`<button class="${cls}" ${D.revealed?'':`data-action="duel-pick" data-pick="${side}"`}><span class="lab">${_pos===0?"A":"B"}</span><span>${esc(d[side])}</span>${vd}</button>`;
  });
  html+=`</div>`;
  if(D.revealed) html+=`<div class="keydiff" style="margin-top:14px"><b>KEY DIFFERENTIATOR</b><br>${esc(d.why)}</div>`;
  html+=`</div>`;
  let foot;
  if(D.revealed){
    foot = (D.i+1>=D.order.length)
      ? `<button class="btn btn-primary" data-action="duel-done">Finish · scored ${D.score}/${D.order.length}</button>`
      : `<button class="btn btn-primary" data-action="duel-next">Next duel</button>`;
  }
  setFoot(foot);
  return html;
}
function viewChecklist(){
  DB.progress.checklist = DB.progress.checklist||{};
  const subs=Object.keys(CHECKLISTS);
  const sub=(App.checklistSubject && CHECKLISTS[App.checklistSubject]) ? App.checklistSubject : subs[0];
  const items=CHECKLISTS[sub]||[];
  const doneN=items.filter((it,i)=>DB.progress.checklist[sub+"|"+i]).length;
  let html=`<div class="fade">
    <button class="btn-sm btn-ghost" data-action="nav" data-screen="home" style="margin-bottom:14px"><svg class="i" viewBox="0 0 24 24" style="width:15px;height:15px"><path d="M15 18l-6-6 6-6"/></svg> Home</button>
    <h2 class="serif" style="font-size:24px;font-weight:600">\u{1F4CB} Before-exam checklist</h2>
    <p class="muted" style="font-size:13.5px;margin-top:2px">Must-know patterns per subject — tick what you've nailed, tap a row to drill its questions.</p>
    <div class="wrapflex" style="margin:12px 0 6px">`;
  subs.forEach(x=>{ html+=`<button class="btn-ghost btn-sm ${x===sub?'on':''}" data-action="checklist-subject" data-subject="${esc(x)}">${esc(x)}</button>`; });
  html+=`</div>
    <div class="row between" style="margin:10px 2px 8px"><span class="faint" style="font-size:12.5px">${esc(sub)}</span><span class="mono faint" style="font-size:12px">${doneN}/${items.length} done</span></div>
    <div class="progressbar" style="margin-bottom:14px"><i style="width:${items.length?Math.round(doneN/items.length*100):0}%"></i></div>`;
  items.forEach((it,i)=>{
    const key=sub+"|"+i, done=!!DB.progress.checklist[key], n=checklistMatch(sub,it).length;
    html+=`<div class="card pad" style="margin-bottom:8px;display:flex;gap:11px;align-items:center;${done?'opacity:.62':''}">
      <button class="iconbtn" data-action="checklist-toggle" data-key="${esc(key)}" style="flex:none;width:34px;height:34px;${done?'color:var(--green);border-color:#2e6b4f':''}">${done?'✓':''}</button>
      <div style="flex:1"><div style="font-weight:600;font-size:14px;${done?'text-decoration:line-through':''}">${esc(it.t)}</div>
      <div class="faint" style="font-size:12px;margin-top:1px">${n} question${n!==1?'s':''} in bank</div></div>
      ${n>0?`<button class="iconbtn" data-action="checklist-drill" data-sys="${esc(sub)}" data-idx="${i}" style="flex:none"><svg class="i" viewBox="0 0 24 24" style="width:18px;height:18px;stroke:var(--teal)"><path d="M9 6l6 6-6 6"/></svg></button>`:''}
    </div>`;
  });
  html+=`</div>`; return html;
}
function viewDisputed(){
  const ids=disputedIds();
  let html=`<div class="fade">
    <button class="btn-sm btn-ghost" data-action="nav" data-screen="home" style="margin-bottom:14px"><svg class="i" viewBox="0 0 24 24" style="width:15px;height:15px"><path d="M15 18l-6-6 6-6"/></svg> Home</button>
    <h2 class="serif" style="font-size:24px;font-weight:600;color:var(--amber)">⚖️ Disputed answers</h2>
    <p class="muted" style="font-size:13.5px;margin-top:2px">${ids.length} question${ids.length!==1?'s':''} where the source answer is flagged against standard teaching</p>`;
  if(!ids.length){ html+=`<div class="empty">No flagged questions in the loaded bank.</div></div>`; return html; }
  html+=`<div style="height:10px"></div><button class="btn btn-primary" data-action="start-disputed">Drill all ${ids.length}</button>`;
  const groups={};
  ids.forEach(id=>{ const q=QMAP[id]; (groups[qSys(q)]=groups[qSys(q)]||[]).push(id); });
  Object.keys(groups).sort().forEach(sys=>{
    html+=`<div class="sectlabel">${esc(sys)} · ${groups[sys].length}</div>`;
    groups[sys].forEach(id=>{ const q=QMAP[id], f=q.flag||{}; const col=/CRITICAL|HIGH/i.test(f.severity||"")?"var(--red)":"var(--amber)";
      html+=`<button class="card pad subj" data-action="study-one" data-id="${esc(id)}" style="margin-bottom:8px;border-left:3px solid ${col}">
        <div class="row between"><span style="font-weight:600;font-size:14px">${esc(q.topic||"General")}</span><span class="badge" style="color:${col}">${esc(f.severity||"FLAG")}</span></div>
        ${(f.app||f.correct)?`<div style="font-size:12px;margin-top:5px">${f.app?`<span style="color:var(--red)">File: ${esc(f.app)}</span>`:""}${f.correct?`<span style="color:var(--green);margin-left:10px">Standard: ${esc(f.correct)}</span>`:""}</div>`:""}
        ${f.note?`<div class="faint" style="font-size:12px;margin-top:4px;line-height:1.4">${esc((f.note||"").slice(0,150))}…</div>`:""}
      </button>`;
    });
  });
  html+=`</div>`; return html;
}
function viewRedflag(){
  const ids=redFlagIds();
  let html=`<div class="fade">
    <button class="btn-sm btn-ghost" data-action="nav" data-screen="home" style="margin-bottom:14px"><svg class="i" viewBox="0 0 24 24" style="width:15px;height:15px"><path d="M15 18l-6-6 6-6"/></svg> Home</button>
    <h2 class="serif" style="font-size:24px;font-weight:600;color:var(--red)">\u{1F6A8} Red-flag drills</h2>
    <p class="muted" style="font-size:13.5px;margin-top:2px">${ids.length} can't-miss / emergency question${ids.length!==1?'s':''} — missing these changes management</p>`;
  if(!ids.length){ html+=`<div class="empty">No red-flag questions matched in the loaded bank.</div></div>`; return html; }
  html+=`<div style="height:10px"></div><button class="btn btn-primary" data-action="start-redflag">Drill all ${ids.length}</button>`;
  const groups={};
  ids.forEach(id=>{ const q=QMAP[id]; (groups[qSys(q)]=groups[qSys(q)]||[]).push(id); });
  Object.keys(groups).sort().forEach(sys=>{
    html+=`<div class="sectlabel">${esc(sys)} · ${groups[sys].length}</div>`;
    groups[sys].forEach(id=>{ const q=QMAP[id];
      html+=`<button class="card pad subj" data-action="study-one" data-id="${esc(id)}" style="margin-bottom:8px;border-left:3px solid var(--red)">
        <div class="row between"><span style="font-weight:600;font-size:14px">${esc(q.topic||"General")}</span><span class="pill" style="color:var(--red)">⚠️</span></div>
        <div class="faint" style="font-size:12px;margin-top:4px;line-height:1.4">${esc((q.stem||"").slice(0,95))}…</div>
      </button>`;
    });
  });
  html+=`</div>`; return html;
}
function viewMistakes(){
  const ids=mistakeIds();
  let html=`<div class="fade">
    <button class="btn-sm btn-ghost" data-action="nav" data-screen="home" style="margin-bottom:14px"><svg class="i" viewBox="0 0 24 24" style="width:15px;height:15px"><path d="M15 18l-6-6 6-6"/></svg> Home</button>
    <h2 class="serif" style="font-size:24px;font-weight:600;color:var(--red)">\u{1F525} Mistake notebook</h2>
    <p class="muted" style="font-size:13.5px;margin-top:2px">${ids.length} question${ids.length!==1?'s':''} you've missed at least once</p>`;
  if(!ids.length){ html+=`<div class="empty">No mistakes yet — the questions you get wrong collect here automatically.</div></div>`; return html; }
  html+=`<div style="height:10px"></div><button class="btn btn-primary" data-action="start-mistakes">Drill all ${ids.length} mistakes</button>`;
  html+=`<div style="height:8px"></div><button class="btn btn-ghost btn-sm" data-action="export-anki-mistakes"><svg class="i" viewBox="0 0 24 24" style="width:15px;height:15px"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg> Export mistakes to Anki</button>`;
  const groups={};
  ids.forEach(id=>{ const q=QMAP[id]; (groups[qSys(q)]=groups[qSys(q)]||[]).push(id); });
  Object.keys(groups).sort().forEach(sys=>{
    const list=groups[sys].sort((a,b)=>missCount(b)-missCount(a));
    html+=`<div class="sectlabel">${esc(sys)} · ${list.length}</div>`;
    list.forEach(id=>{ const q=QMAP[id], mc=missCount(id), p=DB.progress.questions[id]||{};
      html+=`<button class="card pad subj" data-action="study-one" data-id="${esc(id)}" style="margin-bottom:8px;border-left:3px solid ${mc>1?'var(--red)':'var(--amber)'}">
        <div class="row between"><span style="font-weight:600;font-size:14px">${esc(q.topic||'General')}</span>
        ${mc>1?`<span class="badge" style="background:var(--red-deep);color:var(--red)">missed ${mc}×</span>`:`<span class="faint mono" style="font-size:11.5px">${esc(p.lastResult||'')}</span>`}</div>
        <div class="faint" style="font-size:12px;margin-top:4px;line-height:1.4">${esc((q.stem||'').slice(0,95))}…</div>
      </button>`;
    });
  });
  html+=`</div>`; return html;
}

/* mark the currently-announced fixes as seen so they don't re-announce */
function markFixesSeen(){ const a=App.fixAlert&&App.fixAlert.ids; if(a&&a.length){ const s=Array.isArray(DB.settings.fixSeen)?DB.settings.fixSeen:[]; DB.settings.fixSeen=[...new Set([...s,...a])]; save.settings(); } App.fixAlert=null; }
/* the pristine (pre-fix) version of a question — BANK is never mutated by edits */
function origQ(qid){ for(const p of BANK){ const q=(p.questions||[]).find(x=>x.id===qid); if(q) return q; } return null; }
/* "Recently fixed" — shows OLD → NEW answer for each maintainer fix */
function viewFixes(){
  const ids=(App.fixReview||[]).filter(id=>QMAP[id]);
  let html=`<div class="fade">
    <button class="btn-sm btn-ghost" data-action="nav" data-screen="home" style="margin-bottom:14px"><svg class="i" viewBox="0 0 24 24" style="width:15px;height:15px"><path d="M15 18l-6-6 6-6"/></svg> Home</button>
    <h2 class="serif" style="font-size:24px;font-weight:600;color:var(--green)">\u{1F527} Recently fixed</h2>
    <p class="muted" style="font-size:13.5px;margin-top:2px">${ids.length} question${ids.length!==1?'s':''} updated to match standard teaching — here's exactly what changed.</p>`;
  if(!ids.length){ html+=`<div class="empty">Nothing to review right now.</div></div>`; return html; }
  html+=`<div style="height:8px"></div><button class="btn btn-primary" data-action="study-fixes">Drill all ${ids.length}</button>`;
  ids.forEach(id=>{
    const nu=QMAP[id], og=origQ(id);
    const nc=(nu.choices||[]).find(c=>c.correct), oc=og&&(og.choices||[]).find(c=>c.correct);
    const changed = nc&&oc&&nc.l!==oc.l;
    html+=`<div class="card pad" style="margin-bottom:10px;border-left:3px solid var(--green)">
      <div class="row between"><span style="font-weight:700;font-size:14px">${esc(nu.topic||'General')}</span><span class="pill" style="color:var(--green);border-color:var(--green)">updated</span></div>
      <div class="faint" style="font-size:12px;margin-top:6px;line-height:1.45">${esc(stripBold(nu.stem||'').replace(/<[^>]+>/g,'').slice(0,140))}…</div>`;
    if(changed){
      html+=`<div style="margin-top:10px;font-size:13.5px;line-height:1.5">
        <div style="color:var(--red)"><b>Was:</b> ${oc.l}. ${esc(oc.t)}</div>
        <div style="color:var(--green);margin-top:3px"><b>Now:</b> ${nc.l}. ${esc(nc.t)}</div></div>`;
    } else {
      html+=`<div style="margin-top:10px;font-size:13px;color:var(--muted)">Answer unchanged — the explanation / key point was refined.${nc?` <b>Correct: ${nc.l}. ${esc(nc.t)}</b>`:''}</div>`;
    }
    const note = nu.flag && nu.flag.note;
    if(note) html+=`<div class="exp" style="margin-top:8px">${esc(note)}</div>`;
    html+=`<div style="margin-top:11px"><button class="btn-sm btn-ghost" data-action="study-one" data-id="${esc(id)}" style="width:auto">Study this question →</button></div>`;
    html+=`</div>`;
  });
  html+=`</div>`; return html;
}
/* ---------- QUESTION BANK (specialty grid → multi-select sessions) ---------- */
function viewBank(){
  const sysList=listSystems();
  const totalQ=Object.keys(QMAP).length, totalSeen=Object.keys(DB.progress.questions).length;
  const dc=disputedIds().length, rf=redFlagIds().length;
  let html=`<div class="fade">
    <div class="mobonly" style="margin-bottom:10px"><button class="btn-sm btn-ghost" data-action="nav" data-screen="home"><svg class="i" viewBox="0 0 24 24" style="width:15px;height:15px"><path d="M15 18l-6-6 6-6"/></svg> Home</button></div>
    <h2 class="serif" style="font-size:26px;font-weight:600">Question bank</h2>
    <p class="muted" style="font-size:13.5px;margin-top:3px">Pick a specialty, then choose sessions to quiz. <b>${totalQ}</b> questions · <b>${totalSeen}</b> seen.</p>
    <div style="height:12px"></div>
    <div class="modegrid">
      <button class="modecard disp" data-action="open-disputed"><span class="mi">⚖️</span><div><div class="n">${dc}</div><div class="l">Disputed answers</div></div></button>
      <button class="modecard rf" data-action="open-redflag"><span class="mi">\u{1F6A8}</span><div><div class="n">${rf}</div><div class="l">Red-flag drills</div></div></button>
    </div>
    <div class="sectlabel">All specialties</div>
    <div class="qgrid">`;
  if(!sysList.length) html+=`</div><div class="empty">No questions loaded yet — pull to sync.</div>`;
  sysList.forEach(s=>{
    const pct=s.total?Math.round(s.seen/s.total*100):0;
    html+=`<button class="scard" data-action="open-bank-system" data-system="${esc(s.name)}">
      <div class="row between">
        <span class="code" style="background:${s.color}">${esc(codeOf(s.name))}</span>
        ${s.due>0?`<span class="badge due">${s.due} due</span>`:``}
      </div>
      <h3>${esc(s.name)}</h3>
      <div class="meta"><span class="faint mono">${s.seen}/${s.total}</span><span style="font-weight:700;color:${pct?'var(--coral)':'var(--faint)'}">${pct}%</span></div>
      <div class="progressbar" style="margin-top:8px"><i style="width:${pct}%"></i></div>
    </button>`;
  });
  html+=`</div></div>`;
  return html;
}
function bankPickSet(sys){ if(!App.bankPick||App.bankPick.system!==sys) App.bankPick={system:sys,refs:new Set()}; return App.bankPick.refs; }
function viewBankSystem(){
  const sys=App.nav.system;
  const refs=groupCounts(q=>qSys(q)===sys, qRef);
  const sel=bankPickSet(sys);
  const col=(listSystems().find(s=>s.name===sys)||{}).color||"var(--coral)";
  let html=`<div class="fade">
    <button class="btn-sm btn-ghost" data-action="nav" data-screen="bank" style="margin-bottom:14px"><svg class="i" viewBox="0 0 24 24" style="width:15px;height:15px"><path d="M15 18l-6-6 6-6"/></svg> Question bank</button>
    <h2 class="serif" style="font-size:24px;font-weight:600;color:${col}">${esc(sys)}</h2>
    <p class="muted" style="font-size:13.5px;margin-top:2px">${refs.length} source${refs.length!==1?'s':''} · tick the sessions you want, then start one combined quiz.</p>
    <div style="height:8px"></div>`;
  refs.forEach(r=>{
    const pct=r.total?Math.round(r.seen/r.total*100):0, on=sel.has(r.name);
    const status=r.seen===0?"Not started":(r.seen>=r.total?"Completed":"In progress");
    html+=`<button class="card pad subj${on?' picked':''}" data-action="bank-pick" data-ref="${esc(r.name)}" style="width:100%;margin-bottom:9px">
      <div class="row between">
        <div style="text-align:left;min-width:0;flex:1">
          <div style="font-weight:700;font-size:14.5px">${esc(r.name)}</div>
          <div class="faint" style="font-size:12px;margin-top:1px">${status} · ${r.total} Q${r.due>0?` · ${r.due} due`:''}</div>
          <div class="progressbar" style="margin-top:8px"><i style="width:${pct}%"></i></div>
        </div>
        <span class="tick">${on?'<svg class="i" viewBox="0 0 24 24" style="width:14px;height:14px;stroke:#fff;stroke-width:3;fill:none"><path d="M20 6 9 17l-5-5"/></svg>':''}</span>
      </div>
    </button>`;
  });
  html+=`</div>`;
  if(sel.size){
    let n=0; sel.forEach(r=>{ n+=poolFor({system:sys,reference:r}).length; });
    html+=`<div class="selbar"><div class="selbar-in">
      <div style="flex:1"><b>${sel.size}</b> session${sel.size>1?'s':''} · ${n} question${n!==1?'s':''} selected</div>
      <button class="btn btn-primary" data-action="bank-start" style="width:auto">Select sessions to start</button>
    </div></div>`;
  }
  return html;
}
/* ---------- PROGRESS ---------- */
function viewProgress(){
  const qs=DB.progress.questions, ids=Object.keys(qs);
  let att=0,corr=0; ids.forEach(id=>{att+=qs[id].seen;corr+=qs[id].correct;});
  const acc=att?Math.round(corr/att*100):0;
  const wk=weekTime(), wkSec=wk.reduce((a,b)=>a+b.sec,0);
  const L=timeLog(); let prev=0; for(let i=7;i<14;i++){ const d=addDays(today(),-i); prev+=(L[d]?L[d].total:0); }
  const delta = prev? Math.round((wkSec-prev)/prev*100) : (wkSec?100:0);
  let html=`<div class="fade">
    <div class="mobonly" style="margin-bottom:10px"><button class="btn-sm btn-ghost" data-action="nav" data-screen="home"><svg class="i" viewBox="0 0 24 24" style="width:15px;height:15px"><path d="M15 18l-6-6 6-6"/></svg> Home</button></div>
    <h2 class="serif" style="font-size:26px;font-weight:600">Progress</h2>
    <div style="height:14px"></div>
    <div class="card pad">
      <div class="row between" style="align-items:flex-start">
        <div><div class="mono" style="font-size:34px;font-weight:800;line-height:1">${wkSec?fmtHM(wkSec):"0m"}</div>
        <div class="faint" style="font-size:12px;margin-top:4px">this week · ${delta>=0?`<span style="color:var(--green);font-weight:700">▲ ${delta}%</span>`:`<span style="color:var(--red);font-weight:700">▼ ${-delta}%</span>`} vs last</div></div>
        <div class="row" style="gap:16px">
          <div style="text-align:center"><div class="mono" style="font-size:23px;font-weight:800;color:var(--coral)">${acc}%</div><div class="faint" style="font-size:11px">Accuracy</div></div>
          <div style="text-align:center"><div class="mono" style="font-size:23px;font-weight:800">${DB.progress.streak?.current||0}</div><div class="faint" style="font-size:11px">Streak</div></div>
        </div>
      </div>
      <div style="margin-top:16px">${weekBarsInner()}</div>
    </div>
    <div class="sectlabel">By specialty</div><div class="card pad" style="padding:4px 15px">`;
  const sl=listSystems();
  if(!sl.length) html+=`<div class="empty" style="padding:16px 0">No specialties loaded yet.</div>`;
  sl.forEach((s,idx)=>{ const pct=s.total?Math.round(s.seen/s.total*100):0;
    html+=`<div style="padding:13px 0;${idx?'border-top:1px solid var(--line-soft)':''}">
      <div class="row between" style="font-size:14px;margin-bottom:7px"><span style="color:${s.color};font-weight:600">${esc(s.name)}</span><span class="mono faint" style="font-size:12px">${s.seen}/${s.total} · ${pct}%</span></div>
      <div class="progressbar" style="margin:0"><i style="width:${pct}%"></i></div></div>`;
  });
  html+=`</div>
    <button class="btn btn-ghost" data-action="nav" data-screen="stats" style="margin-top:14px"><svg class="i" viewBox="0 0 24 24" style="width:16px;height:16px"><path d="M3 3v18h18"/><path d="M7 14l3-3 3 3 4-5"/></svg> Full stats, calibration & forecast</button>
    <div style="height:9px"></div>
    <button class="btn btn-ghost" data-action="open-timer">⏱️ Study timer & focus calendar</button>
  </div>`;
  return html;
}
/* ---------- SAVED (bookmarks + shortcuts) ---------- */
function viewSaved(){
  const qs=DB.progress.questions, ids=Object.keys(qs);
  const marked=ids.filter(id=>qs[id].marked && QMAP[id]);
  const mis=mistakeIds();
  let html=`<div class="fade">
    <div class="mobonly" style="margin-bottom:10px"><button class="btn-sm btn-ghost" data-action="nav" data-screen="home"><svg class="i" viewBox="0 0 24 24" style="width:15px;height:15px"><path d="M15 18l-6-6 6-6"/></svg> Home</button></div>
    <h2 class="serif" style="font-size:26px;font-weight:600">Saved</h2>
    <p class="muted" style="font-size:13.5px;margin-top:3px">${marked.length} bookmarked · ${mis.length} in your mistake notebook.</p>
    <div style="height:12px"></div>
    <div class="modegrid">
      <button class="modecard" style="border-color:var(--line);background:var(--surface)" data-action="open-mistakes"><span class="mi" style="background:var(--red-deep);color:var(--red)">\u{1F525}</span><div><div class="n">${mis.length}</div><div class="l">Mistakes</div></div></button>
      <button class="modecard" style="border-color:var(--line);background:var(--surface)" data-action="open-disputed"><span class="mi" style="background:var(--amber-deep);color:var(--amber)">⚖️</span><div><div class="n">${disputedIds().length}</div><div class="l">Disputed</div></div></button>
    </div>`;
  if(!marked.length){ html+=`<div class="empty">No bookmarks yet — tap the flag on any question while studying to save it here for later.</div></div>`; return html; }
  html+=`<div style="height:4px"></div><button class="btn btn-primary" data-action="study-saved">Drill all ${marked.length} saved</button>`;
  const groups={}; marked.forEach(id=>{const q=QMAP[id];(groups[qSys(q)]=groups[qSys(q)]||[]).push(id);});
  Object.keys(groups).sort().forEach(sys=>{ html+=`<div class="sectlabel">${esc(sys)} · ${groups[sys].length}</div>`;
    groups[sys].forEach(id=>{const q=QMAP[id];
      html+=`<button class="card pad subj" data-action="study-one" data-id="${esc(id)}" style="margin-bottom:8px;border-left:3px solid var(--amber)">
        <div class="row between"><span style="font-weight:600;font-size:14px">${esc(q.topic||'General')}</span><svg class="i" viewBox="0 0 24 24" style="width:15px;height:15px;fill:var(--amber);stroke:var(--amber)"><path d="M5 3v18l7-5 7 5V3z"/></svg></div>
        <div class="faint" style="font-size:12px;margin-top:4px;line-height:1.4">${esc(stripBold(q.stem||'').replace(/<[^>]+>/g,'').slice(0,92))}…</div></button>`;
    });
  });
  html+=`</div>`; return html;
}
/* ---------- QUIZ (answer-then-reveal) ---------- */
function sessKey(ctx){ return JSON.stringify(ctx); }
function sessionsMap(){ if(!DB.progress.sessions) DB.progress.sessions={}; return DB.progress.sessions; }
function saveSession(s){ if(!s||!s.ctx||s.ctx.smart) return; sessionsMap()[sessKey(s.ctx)]={ctx:s.ctx,i:s.i,label:s.label,total:s.pool.length,answered:s.answered,correct:s.correct,xp:s.xp,savedAt:Date.now()}; DB.progress.resume={ctx:s.ctx,i:s.i,label:s.label}; save.progress(); }
function clearSession(ctx){ if(ctx&&!ctx.smart){ delete sessionsMap()[sessKey(ctx)]; if(DB.progress.resume&&DB.progress.resume.ctx&&sessKey(DB.progress.resume.ctx)===sessKey(ctx)) DB.progress.resume=null; save.progress(); } }
export function startPracticeCtx(ctx, label, startIndex){
  const pool = ctx.smart ? smartPool() : poolFor(ctx);
  if(!pool.length){ toast(ctx.smart?"Nothing due — pick a topic":"No questions here yet"); return; }
  const sv = ctx.smart ? null : sessionsMap()[sessKey(ctx)];
  let i = (startIndex!=null) ? startIndex : (sv && sv.i<pool.length ? sv.i : 0); if(i>=pool.length) i=0;
  App.practice={ctx,label,pool,i,revealed:false,selected:null,answered:(sv?sv.answered:0)||0,correct:(sv?sv.correct:0)||0,xp:(sv?sv.xp:0)||0};
  if(!ctx.smart) saveSession(App.practice);
  practiceRoute();
}
function setupPracticeTheme(q){
  const key=qSys(q)+"|"+qRef(q)+"|"+(q.topic||"General");
  if(!(App.theme && App.theme.fromPractice && App.theme._key===key)){
    App.theme={ _key:key, sys:qSys(q), ty:"EMQs", reference:qRef(q), topic:q.topic, revealed:{}, picks:{}, optsCollapsed:false, fromPractice:true };
  }
}
function practiceRoute(){
  const s=App.practice;
  if(!s){ App.screen="home"; render(); return; }
  const q=QMAP[s.pool[s.i]];
  if(q && q.type==="emq"){ setupPracticeTheme(q); App.screen="theme"; }
  else App.screen="quiz";
  render(); window.scrollTo({top:0,behavior:"instant"});
}
export function smartPool(){
  const t=today(), due=[], fresh=[];
  allQs().forEach(q=>{ const p=DB.progress.questions[q.id];
    if(p&&p.srs){ if(p.srs.due&&p.srs.due<=t) due.push(q.id); }
    else fresh.push(q.id);
  });
  fresh.sort(()=>Math.random()-0.5);
  return [...due, ...fresh.slice(0, DB.settings.newPerDay)];
}
function gradeCurrent(g){
  const s=App.practice, q=QMAP[s.pool[s.i]];
  const single=(q.type!=="sa") && (q.choices||[]).length<2;
  const ok = (q.type==="sa"||single) ? (g==="good"||g==="easy") : (correctLabel(q)===s.selected);
  recordAttempt(q,s.selected,g,q.type==="sa"?ok:undefined, s.confidence);
  cue(ok?"correct":"wrong");
  s.answered++; if(ok)s.correct++; s.xp+=awardXP(ok?10:4);
  evaluateAchievements(); advancePractice();
}
function duelPick(side){
  if(App.duel.revealed) return;
  App.duel.picked=side; App.duel.revealed=true;
  const d=DUELS[App.duel.order[App.duel.i]]; const ok=side===d.correct; if(ok) App.duel.score++;
  cue(ok?"correct":"wrong"); render();
}
function viewQuiz(){
  const s=App.practice, q=QMAP[s.pool[s.i]];
  const singleAnswer=(q.type!=="sa") && (q.choices||[]).length<2;
  const prog=DB.progress.questions[q.id];
  const marked=prog?.marked;
  let html=`<div class="fade">
    <div class="row between" style="margin-bottom:6px">
      <button class="btn-sm btn-ghost" data-action="end-practice"><svg class="i" viewBox="0 0 24 24" style="width:15px;height:15px"><path d="M15 18l-6-6 6-6"/></svg> Exit</button>
      <span class="mono faint" style="font-size:13px">${s.i+1} / ${s.pool.length}</span>
      <button class="iconbtn" data-action="toggle-mark" title="Mark for review" style="${marked?'color:var(--amber);border-color:#6b541f':''}">
        <svg class="i" viewBox="0 0 24 24" style="${marked?'fill:var(--amber)':''}"><path d="M5 3v18l7-5 7 5V3z"/></svg>
      </button>
    </div>
    <div class="progressbar" style="margin-bottom:12px"><i style="width:${(s.i)/s.pool.length*100}%"></i></div>
    <div class="row between" style="margin-bottom:14px">
      <button class="btn-sm btn-ghost" ${s.i>0?'':'disabled'} data-action="nav-q" data-dir="-1"><svg class="i" viewBox="0 0 24 24" style="width:14px;height:14px"><path d="M15 18l-6-6 6-6"/></svg> Back</button>
      <button class="btn-sm btn-ghost" ${s.i<s.pool.length-1?'':'disabled'} data-action="nav-q" data-dir="1">Skip <svg class="i" viewBox="0 0 24 24" style="width:14px;height:14px"><path d="M9 6l6 6-6 6"/></svg></button>
    </div>`;

  html+=`<div class="qmeta">
    <span class="pill" style="color:${colorOf(q)}">${esc(qSys(q))}</span>
    <span class="pill">${esc(q.topic)}</span>
    ${q.type==="emq"?'<span class="pill emqtag">EMQ</span>':q.type==="sa"?'<span class="pill emqtag">Short answer</span>':''}
  </div>
  ${q.type==="emq"&&q.optionsTitle?`<div class="optstitle">${esc(q.optionsTitle)}</div>`:''}
  <div class="stem serif" style="font-family:inherit">${s.revealed ? q.stem : stripBold(q.stem)}</div>`;

  // answer area (type-aware)
  if(q.type==="sa"){
    if(!s.revealed) html+=`<div class="faint" style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;margin:6px 0 8px">Your answer</div>
      <textarea id="saInput" class="sainput" placeholder="Write your answer, then reveal the model answer…">${esc(s.saText||"")}</textarea>`;
  } else if(singleAnswer){
    const noOpts=(q.choices||[]).length===0;
    if(!s.revealed){
      html+=`<div class="card pad" style="border-left:3px solid var(--amber)"><div class="faint" style="font-size:13px;line-height:1.55">⚑ <b>Recalled question</b> — ${noOpts?"the source did not preserve the options or a marked answer for this item. Tap <b>Reveal</b> to study the concept below, then grade your recall.":"the source preserved only the answer, not the full option list. Tap <b>Reveal answer</b> to see it."}</div></div>`;
    } else if(noOpts){
      html+=`<div class="card pad" style="border-left:3px solid var(--amber)"><div class="faint" style="font-size:13px;line-height:1.55">No answer options were captured for this recalled question — study the key point and summary below.</div></div>`;
    } else {
      const a0=q.choices[0]||{};
      html+=`<div class="choices"><div class="choice correct"><span class="lab"><svg class="i" viewBox="0 0 24 24" style="width:15px;height:15px"><path d="M20 6L9 17l-5-5"/></svg></span><span>${esc(a0.t||"")}</span><span class="vd">ANSWER</span></div></div>`;
    }
  } else {
    const _emqColl = (q.type==="emq") && s.optsCollapsed;
    if(q.type==="emq") html+=`<button class="optshdr" data-action="toggle-emq-opts" style="width:100%;background:none;border:none;color:inherit;font:inherit;text-align:left;cursor:pointer;display:flex;align-items:center;justify-content:space-between"><span>Pick the single best option · ${q.choices.length} options</span><svg class="i" viewBox="0 0 24 24" style="width:18px;height:18px;flex:none;transition:transform .2s;transform:rotate(${_emqColl?'-90deg':'0deg'})"><path d="M6 9l6 6 6-6"/></svg></button>`;
    if(_emqColl){ html+=`<div class="faint" style="font-size:12.5px;padding:8px 2px 0">${q.choices.length} options hidden — tap the header to show them.</div>`; }
    else { html+=`<div class="choices">`;
    q.choices.forEach(c=>{
      let cls="choice"+(q.type==="emq"?" opt":""), vd="";
      if(!s.revealed){ if(s.selected===c.l) cls+=" sel"; }
      else {
        if(c.correct){ cls+=" correct"; vd=`<span class="vd">CORRECT</span>`; }
        else if(s.selected===c.l){ cls+=" wrong"; vd=`<span class="vd">YOUR PICK</span>`; }
      }
      html+=`<button class="${cls}" ${s.revealed?'':`data-action="select-choice" data-label="${c.l}"`}>
        <span class="lab">${c.l}</span><span>${esc(c.t)}</span>${vd}
      </button>`;
    });
    html+=`</div>`; }
  }

  // reveal block
  if(s.revealed) html+=renderReveal(q,s.selected,{saText:s.saText});
  if(!s.revealed && (s.selected || q.type==="sa")){
    html+=`<div class="row" style="gap:8px;justify-content:center;align-items:center;margin-top:16px">
      <span class="faint" style="font-size:12px">How sure?</span>
      <button class="chip ${s.confidence==='sure'?'on':''}" data-action="confidence" data-c="sure">\u{1F44D} Confident</button>
      <button class="chip ${s.confidence==='unsure'?'on':''}" data-action="confidence" data-c="unsure">\u{1F914} Not sure</button>
    </div>`;
  }
  html+=`<div style="text-align:center;margin-top:20px"><button class="reportlink" data-action="report-open" data-qid="${q.id}">⚑ Report an issue with this question</button></div>`;

  // footer
  let foot;
  if(!s.revealed){
    foot=`<button class="btn btn-primary" data-action="reveal" ${(q.type==="sa"||s.selected||singleAnswer)?'':'disabled'}>Reveal answer</button>`;
  } else {
    foot=`<div style="width:100%">
      <div class="faint" style="font-size:11px;text-align:center;letter-spacing:.1em;text-transform:uppercase;margin-bottom:8px">How well did you recall it?</div>
      <div class="grades">
        <button class="grade again" data-action="grade" data-grade="again"><div class="gl">Again</div><div class="gi">&lt;1d</div></button>
        <button class="grade hard" data-action="grade" data-grade="hard"><div class="gl">Hard</div><div class="gi">soon</div></button>
        <button class="grade good" data-action="grade" data-grade="good"><div class="gl">Good</div><div class="gi">${schedDays(q,'good')}d</div></button>
        <button class="grade easy" data-action="grade" data-grade="easy"><div class="gl">Easy</div><div class="gi">${schedDays(q,'easy')}d</div></button>
      </div></div>`;
  }
  html+=`</div>`;
  setFoot(foot);
  return html;
}
function schedDays(q,grade){ const cur=DB.progress.questions[q.id]?.srs; return schedule(cur,grade).interval; }

function reviewStatusBadge(q){
  const p=DB.progress.questions[q.id];
  const box=inner=>`<div style="display:flex;flex-wrap:wrap;gap:9px;align-items:center;font-size:12px;color:var(--faint);background:var(--surface-2);border:1px solid var(--line-soft);border-radius:10px;padding:8px 11px;margin-bottom:12px">${inner}</div>`;
  if(!p || !p.seen){ return box(`<span style="font-weight:700;color:var(--teal)">\u{1F195} First time</span><span>this one enters your review schedule now</span>`); }
  const acc=Math.round(p.correct/p.seen*100);
  const accCol = acc>=70?'var(--green)':acc>=40?'var(--amber)':'var(--red)';
  let last=''; if(p.lastResult==='correct') last=`<span style="color:var(--green)">last: correct</span>`; else if(p.lastResult==='wrong') last=`<span style="color:var(--red)">last: missed</span>`;
  let srs=''; if(p.srs){ if(p.srs.due){ const d=Math.round((new Date(p.srs.due)-new Date(today()))/864e5); srs = d<=0?`<span style="color:var(--teal)">due now</span>`:`next in ${d}d`; } if(p.srs.lapses){ srs += (srs?' · ':'')+`${p.srs.lapses} lapse${p.srs.lapses>1?'s':''}`; } }
  return box(`<span>Seen <b>${p.seen}×</b></span><span style="color:${accCol};font-weight:700">${acc}% right</span>${last?`<span>${last}</span>`:''}${srs?`<span>${srs}</span>`:''}`);
}
function renderReveal(q, chosen, opts={}){
  const cl=correctLabel(q);
  let html=`<div class="reveal stagger">`;
  html+=reviewStatusBadge(q);
  // flag
  if(q.flag){
    const f=q.flag;
    html+=`<div class="flag ${f.severity}">
      <div class="k"><svg class="i" viewBox="0 0 24 24" style="width:15px;height:15px"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg> ${f.severity} · FILE ANSWER vs STANDARD TEACHING</div>
      ${(f.app||f.correct)?`<div class="vs">${f.app?`<span class="tag" style="color:var(--red)">App: ${esc(f.app)}</span>`:''}${f.correct?`<span class="tag" style="color:var(--green)">Correct: ${esc(f.correct)}</span>`:''}${f.source?`<span class="tag">${esc(f.source)}</span>`:''}</div>`:(f.source?`<div class="vs"><span class="tag">${esc(f.source)}</span></div>`:'')}
      ${f.note?`<div class="note">${esc(f.note)}</div>`:''}
    </div>`;
  }
  // answer / model answer (type-aware)
  if(q.type==="sa"){
    if(opts.saText) html+=`<div class="block"><div class="ttl">Your answer</div><div class="body"><div style="white-space:pre-wrap">${esc(opts.saText)}</div></div></div>`;
    html+=`<div class="ansbox"><div class="k">Model answer</div><div class="v" style="white-space:pre-wrap">${esc(q.modelAnswer||"—")}</div></div>`;
  } else {
    if(cl) html+=`<div class="ansbox"><div class="k">Correct answer</div>
      <div class="v">${cl} — ${esc((q.choices.find(c=>c.l===cl)||{}).t||"")}</div></div>`;
    if(q.type==="emq"){
      const cc=q.choices.find(c=>c.correct);
      if(cc && cc.e) html+=`<div class="block"><div class="ttl">Why this option</div><div class="body"><div class="exp" style="margin:0">${cc.e}</div></div></div>`;
      const _wn=q.choices.filter(c=>!c.correct && c.e).slice(0,3);
      if(_wn.length){
        html+=`<div class="block"><div class="ttl">Why not the closest answers</div><div class="body" style="padding:0">`;
        _wn.forEach((c,idx)=>{ html+=`<div style="padding:12px 14px;${idx?'border-top:1px solid var(--line-soft)':''}">
          <div class="row" style="gap:9px;align-items:flex-start">
            <span class="lab" style="background:var(--surface-3);color:var(--muted);border:none;width:24px;height:24px;border-radius:7px;display:grid;place-items:center;font-weight:700;font-size:12px;flex:none">${c.l}</span>
            <div class="grow"><b>${esc(c.t)}</b><div class="exp" style="margin-top:3px">${c.e}</div></div>
          </div></div>`; });
        html+=`</div></div>`;
      }
    } else {
      html+=`<div class="block"><div class="ttl">Choice analysis</div><div class="body" style="padding:0">`;
      q.choices.forEach((c,idx)=>{
        const isC=c.correct;
        html+=`<div style="padding:12px 14px;${idx?'border-top:1px solid var(--line-soft)':''}">
          <div class="row" style="gap:9px;align-items:flex-start">
            <span class="lab" style="background:${isC?'var(--green)':'var(--surface-3)'};color:${isC?'#04211e':'var(--muted)'};border:none;width:24px;height:24px;border-radius:7px;display:grid;place-items:center;font-weight:700;font-size:12px;flex:none">${c.l}</span>
            <div class="grow"><b style="${isC?'color:var(--green)':''}">${esc(c.t)}</b>
            <span style="font-size:11px;font-weight:800;letter-spacing:.05em;margin-left:6px;color:${isC?'var(--green)':'var(--red)'}">${isC?'CORRECT':'WRONG'}</span>
            ${(chosen===c.l&&!isC)?'<span class="pill amber" style="margin-left:6px">your pick</span>':''}
            <div class="exp">${c.e}</div></div>
          </div></div>`;
      });
      html+=`</div></div>`;
    }
  }

  // key differentiator
  if(q.keyDiff) html+=`<div class="keydiff"><b>KEY DIFFERENTIATOR</b><br>${q.keyDiff}</div>`;
  // key point
  if(q.keyPoint) html+=`<div class="keypoint"><div class="k"><svg class="i" viewBox="0 0 24 24" style="width:15px;height:15px"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1h6c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z"/></svg> KEY POINT</div>
    <div class="v">${esc(q.keyPoint)}</div></div>`;
  // summary table
  if(q.sum){
    html+=`<div class="block"><div class="ttl">High-yield summary</div><div style="overflow-x:auto"><table class="sum"><thead><tr>`;
    q.sum.headers.forEach(h=>html+=`<th>${esc(h)}</th>`);
    html+=`</tr></thead><tbody>`;
    q.sum.rows.forEach(r=>{ html+="<tr>"; r.forEach(cell=>html+=`<td>${esc(cell)}</td>`); html+="</tr>"; });
    html+=`</tbody></table></div></div>`;
  }
  if(q.refs) html+=`<div class="faint" style="font-size:12px;text-align:right">Source: ${esc(q.refs)}</div>`;
  html+=`</div>`;
  return html;
}

function advancePractice(){
  const s=App.practice;
  if(s.i+1>=s.pool.length){
    clearSession(s.ctx); DB.progress.resume=null; save.progress();
    App.lastSession={answered:s.answered, correct:s.correct, xp:s.xp, label:s.label};
    evaluateAchievements({perfectSet: s.answered>=10 && s.correct===s.answered});
    App.practice=null; App.screen="celebrate"; render(); confetti(); cue("done");
    return;
  }
  s.i++; s.revealed=false; s.selected=null; s.saText=""; s.optsCollapsed=false; s.confidence=null;
  saveSession(s);
  practiceRoute();
}

/* ---------- SESSION CELEBRATION ---------- */
function viewCelebrate(){
  const r=App.lastSession||{answered:0,correct:0,xp:0,label:""};
  const acc=r.answered?Math.round(r.correct/r.answered*100):0;
  const msg = acc>=90?"Outstanding!" : acc>=70?"Great work!" : acc>=50?"Nice progress!" : "Every rep counts!";
  const lvl=levelOf(DB.progress.xp), streak=DB.progress.streak?.current||0;
  return `<div class="fade celebrate">
    <div style="font-size:46px;line-height:1">&#127881;</div>
    <div class="big" style="margin-top:6px">${msg}</div>
    <div class="muted" style="margin-top:4px">${esc(r.label||"Session")} complete</div>
    <div class="xpgain">+${r.xp} XP</div>
    <div class="stat3 stagger" style="margin-top:18px">
      <div class="card"><div class="n teal">${r.correct}/${r.answered}</div><div class="l">Correct</div></div>
      <div class="card"><div class="n amber">${streak}</div><div class="l">Day streak</div></div>
      <div class="card"><div class="n green">Lv ${lvl}</div><div class="l">Level</div></div>
    </div>
    <div style="height:20px"></div>
    <button class="btn btn-primary" data-action="celebrate-done">Back to home</button>
    <div style="height:8px"></div>
    <button class="btn btn-ghost" data-action="start-smart">Keep going — Smart Review</button>
  </div>`;
}

/* ---------- SEARCH ---------- */
function viewSearch(){
  const f=App.search||(App.search={q:"",subject:null,type:null});
  const subs=listSystems().map(s=>s.name);
  return `<div class="fade">
    <button class="btn-sm btn-ghost" data-action="nav" data-screen="home" style="margin-bottom:14px"><svg class="i" viewBox="0 0 24 24" style="width:15px;height:15px"><path d="M15 18l-6-6 6-6"/></svg> Home</button>
    <h2 class="serif" style="font-size:24px;font-weight:600">Search</h2>
    <p class="muted" style="font-size:13.5px;margin:2px 0 12px">Find any question by keyword, topic, drug, diagnosis — or filter by subject and type.</p>
    <input id="searchbox" class="searchbox" type="search" placeholder="e.g. glaucoma, otitis, thunderclap…" autocomplete="off" value="${esc(f.q||"")}">
    <div class="wrapflex" style="gap:6px;margin-top:10px">
      <button class="chip ${!f.type?"on":""}" data-action="search-filter" data-k="type" data-v="">All types</button>
      <button class="chip ${f.type==="MCQs"?"on":""}" data-action="search-filter" data-k="type" data-v="MCQs">MCQs</button>
      <button class="chip ${f.type==="EMQs"?"on":""}" data-action="search-filter" data-k="type" data-v="EMQs">EMQs</button>
    </div>
    <div class="wrapflex" style="gap:6px;margin-top:8px">
      <button class="chip ${!f.subject?"on":""}" data-action="search-filter" data-k="subject" data-v="">All subjects</button>
      ${subs.map(sb=>`<button class="chip ${f.subject===sb?"on":""}" data-action="search-filter" data-k="subject" data-v="${esc(sb)}">${esc(sb)}</button>`).join("")}
    </div>
    <div id="searchresults" style="margin-top:14px">${searchResultsHTML()}</div>
  </div>`;
}
function searchResultsHTML(){
  const f=App.search||(App.search={q:"",subject:null,type:null});
  const term=(f.q||"").trim().toLowerCase();
  if(term.length<2 && !f.subject && !f.type) return `<div class="empty">Type at least 2 letters, or pick a subject/type filter.</div>`;
  const words=term?term.split(/\s+/):[];
  const hay=q=>((q.stem||"")+" "+(q.topic||"")+" "+qSys(q)+" "+(q.reference||"")+" "+(q.choices||[]).map(c=>c.t).join(" ")+" "+(q.keyPoint||"")+" "+(q.modelAnswer||"")).toLowerCase();
  let pool=allQs();
  if(f.subject) pool=pool.filter(q=>qSys(q)===f.subject);
  if(f.type) pool=pool.filter(q=>qType(q)===f.type);
  const hits=pool.filter(q=>!words.length || words.every(w=>hay(q).includes(w))).slice(0,80);
  if(!hits.length) return `<div class="empty">No matches${f.subject?" in "+esc(f.subject):""}${f.type?" · "+esc(f.type):""}${term?` for “${esc(f.q)}”`:""}.</div>`;
  let html=`<div class="faint" style="font-size:12px;margin-bottom:8px">${hits.length}${hits.length===80?'+':''} result${hits.length!==1?'s':''}</div>`;
  hits.forEach(q=>{
    const plain=stripBold(q.stem||"").replace(/<[^>]+>/g,"");
    const snip=plain.length>120?plain.slice(0,120)+"…":plain;
    html+=`<button class="card pad sugg" data-action="open-q" data-qid="${q.id}" style="margin-bottom:8px;width:100%;text-align:left">
      <div class="row between" style="margin-bottom:3px"><span class="pill" style="color:${colorOf(q)}">${esc(qSys(q))}</span><span class="faint" style="font-size:11px">${esc(q.topic)} · ${qType(q)}</span></div>
      <div style="font-size:13.5px;line-height:1.45">${esc(snip)}</div>
    </button>`;
  });
  return html;
}
document.body.addEventListener("input", e=>{ if(e.target && e.target.id==="searchbox"){ App.search=App.search||{q:"",subject:null,type:null}; App.search.q=e.target.value; const r=$("searchresults"); if(r) r.innerHTML=searchResultsHTML(); } });

/* ---------- ACHIEVEMENTS / TROPHIES ---------- */
function viewTrophies(){
  const got=DB.progress.achievements||{};
  const n=Object.keys(got).length;
  let html=`<div class="fade">
    <button class="btn-sm btn-ghost" data-action="nav" data-screen="home" style="margin-bottom:14px"><svg class="i" viewBox="0 0 24 24" style="width:15px;height:15px"><path d="M15 18l-6-6 6-6"/></svg> Home</button>
    <h2 class="serif" style="font-size:24px;font-weight:600">Achievements</h2>
    <p class="muted" style="font-size:13.5px;margin:2px 0 14px">${n} of ${ACHIEVEMENTS.length} unlocked</p>`;
  ACHIEVEMENTS.forEach(a=>{
    const on=!!got[a.id];
    html+=`<div class="card pad" style="margin-bottom:9px;${on?'':'opacity:.55'}">
      <div class="row" style="gap:13px">
        <div class="ach-ic" style="${on?'':'filter:grayscale(1)'}">${a.icon}</div>
        <div style="flex:1"><div style="font-weight:700;font-size:14.5px">${a.name}</div><div class="faint" style="font-size:12.5px;margin-top:1px">${a.desc}</div></div>
        ${on?`<svg class="i" viewBox="0 0 24 24" style="width:20px;height:20px;stroke:var(--green)"><path d="M20 6L9 17l-5-5"/></svg>`:`<svg class="i" viewBox="0 0 24 24" style="width:18px;height:18px;stroke:var(--faint)"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`}
      </div>
    </div>`;
  });
  html+=`</div>`;
  return html;
}

/* ---------- LEADERBOARD (study group) ---------- */
/* ---- anonymous identity + windowed scoring ---- */
const LB_ADJ=["Swift","Brave","Sharp","Calm","Keen","Bold","Quiet","Clever","Lucky","Steady","Bright","Nimble","Sly","Witty","Mighty","Gentle","Fierce","Wise","Stoic","Zesty"];
const LB_ANI=["Falcon","Otter","Heron","Lynx","Ibex","Raven","Cobra","Gecko","Panda","Tiger","Wolf","Fox","Owl","Hawk","Bison","Crane","Seal","Moth","Stork","Mantis"];
function randomAlias(){ return LB_ADJ[Math.floor(Math.random()*LB_ADJ.length)]+" "+LB_ANI[Math.floor(Math.random()*LB_ANI.length)]+" "+(1+Math.floor(Math.random()*99)); }
function ensureAlias(){ if(!DB.settings.displayName){ DB.settings.displayName=randomAlias(); save.settings(); } return DB.settings.displayName; }
function lbId(){ if(!DB.settings.lbId){ DB.settings.lbId="u"+Math.random().toString(36).slice(2,9)+Date.now().toString(36).slice(-4); save.settings(); } return DB.settings.lbId; }
const curMonth=()=>today().slice(0,7), curYear=()=>today().slice(0,4);
function xpToday(){ return (DB.progress.xpLog||{})[today()]||0; }
function xpWindow(prefix){ const l=DB.progress.xpLog||{}; let s=0; for(const k in l){ if(k.indexOf(prefix)===0) s+=l[k]; } return s; }
function topSubject(){ const m={}; allQs().forEach(q=>{ const p=DB.progress.questions[q.id]; if(p&&p.seen){ const s=qSys(q); m[s]=(m[s]||0)+p.seen; } }); let best="—",bv=0; for(const k in m){ if(m[k]>bv){bv=m[k];best=k;} } return best; }
function activeDays7(){
  const l=DB.progress.xpLog||{}; const now=new Date(today()+"T00:00:00"); let n=0;
  for(const k in l){ if(l[k]>0){ const diff=(now-new Date(k+"T00:00:00"))/86400000; if(diff>=0 && diff<=6) n++; } }
  return n;
}
function myEntry(){
  const t=today();
  return { id:lbId(), name:ensureAlias(), level:levelOf(DB.progress.xp), streak:DB.progress.streak?.current||0,
    subject:topSubject(), week:activeDays7(),
    xpDay:xpToday(), xpMonth:xpWindow(curMonth()), xpYear:xpWindow(curYear()), xpAll:DB.progress.xp||0,
    timeDay:studyToday(), timeWeek:weekTime().reduce((a,b)=>a+b.sec,0),
    studyingNow:!!(DB.progress.timer&&DB.progress.timer.running), studyingSubject:(DB.progress.timer&&DB.progress.timer.running)?DB.progress.timer.subject:null,
    day:t, month:curMonth(), year:curYear() };
}
function postReport(rep,q){
  const ep=DB.settings.groupEndpoint; if(!ep) return false;
  const payload={type:"report", reportId:rep.reportId, date:rep.date, who:ensureAlias(), uid:lbId(),
    qid:rep.qid, subject:rep.subject||"", topic:rep.topic||"", issue:rep.type, note:rep.note||"",
    stem:(q&&q.stem)?String(q.stem).slice(0,400):""};
  try{ fetch(ep,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(payload)}).catch(()=>{}); return true; }catch(e){ return false; }
}
function fmtWhen(v){ try{ const d=new Date(v); if(!isNaN(d)) return d.toLocaleString("en",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}); }catch(e){} return String(v||""); }
async function fetchReports(){
  const ep=DB.settings.groupEndpoint;
  if(!ep){ App.inboxState="noendpoint"; render(); return; }
  App.inboxState="loading"; render();
  try{
    const u=ep+(ep.indexOf("?")>=0?"&":"?")+"reports=1&cb="+Date.now();
    const r=await fetch(u,{cache:"no-store"}); if(!r.ok) throw new Error(r.status);
    const data=await r.json();
    if(Array.isArray(data) && (data.length===0 || Array.isArray(data[0]))){ App.inboxRows=data; App.inboxState="ok"; if(DB.settings.maintainer){ DB.settings.reportSeen=reportRows().length; save.settings(); } }
    else { App.inboxState="notupgraded"; }
  }catch(e){ App.inboxState="error"; }
  if(App.screen==="reportsinbox") render();
}
function viewReportsInbox(){
  const st=App.inboxState||"loading";
  let html=`<div class="fade">
    <button class="btn-sm btn-ghost" data-action="nav" data-screen="settings" style="margin-bottom:14px"><svg class="i" viewBox="0 0 24 24" style="width:15px;height:15px"><path d="M15 18l-6-6 6-6"/></svg> Settings</button>
    <div class="row between"><h2 class="serif" style="font-size:24px;font-weight:600">Reports inbox</h2>
      <button class="iconbtn" data-action="refresh-reports-inbox" aria-label="Refresh"><svg class="i" viewBox="0 0 24 24"><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg></button></div>
    <p class="muted" style="font-size:13px;margin-top:2px">Everyone's reports, pulled live from your group Script.</p>`;
  if(st==="noendpoint") html+=`<div class="card pad"><div class="faint" style="font-size:13px;line-height:1.5">No group Script connected. Add your Apps Script URL via the manifest <span class="mono">leaderboard</span> field, then refresh.</div></div>`;
  else if(st==="loading") html+=`<div class="empty">Loading reports…</div>`;
  else if(st==="error") html+=`<div class="card pad"><div style="font-size:13px;line-height:1.5">Couldn't reach the Script. Check it's deployed with access set to <b>Anyone</b>, and the URL is correct.</div></div>`;
  else if(st==="notupgraded") html+=`<div class="card pad" style="border-left:3px solid var(--amber)"><div style="font-size:13px;line-height:1.5">The Script returned leaderboard data, not reports. Add the <b>doGet <span class="mono">?reports=1</span></b> branch to your Apps Script (see setup) and redeploy a new version.</div></div>`;
  else {
    const data=(App.inboxRows||[]).slice(); if(data.length && Array.isArray(data[0]) && String(data[0][0]).toLowerCase().indexOf("when")>=0) data.shift();
    if(!data.length){ html+=`<div class="empty">No reports yet. They'll appear here as your group submits them.</div>`; }
    else{
      html+=`<p class="muted" style="font-size:12.5px">${data.length} report${data.length>1?"s":""} · newest first</p>`;
      data.reverse().forEach(r=>{
        const issue=esc(String(r[5]||"Report")), subj=esc(String(r[2]||"")), topic=r[3]?" · "+esc(String(r[3])):"", who=esc(String(r[1]||"anon")), qid=esc(String(r[4]||"")), note=String(r[6]||""), stem=String(r[7]||"");
        html+=`<div class="card pad" ${qid?`data-action="open-reported-q" data-qid="${qid}" style="margin-bottom:8px;border-left:3px solid var(--amber);cursor:pointer"`:`style="margin-bottom:8px;border-left:3px solid var(--amber)"`}>
          <div class="row between" style="font-size:12px"><span style="font-weight:700;color:var(--amber)">${issue}</span><span class="mono faint">${esc(fmtWhen(r[0]))}</span></div>
          <div class="faint" style="font-size:12px;margin-top:2px">${subj}${topic}</div>
          ${stem?`<div style="font-size:12.5px;margin-top:7px;font-style:italic;color:var(--muted)">${esc(stem)}</div>`:""}
          ${note?`<div style="font-size:14px;margin-top:7px">${esc(note)}</div>`:`<div class="faint" style="font-size:13px;margin-top:7px">(no note added)</div>`}
          <div class="row between" style="font-size:11.5px;margin-top:8px"><span class="faint">by ${who}</span>${qid?`<span class="mono" style="color:var(--teal)">${qid} · fix &rarr;</span>`:`<span class="mono faint">&mdash;</span>`}</div>
        </div>`;
      });
    }
  }
  html+=`</div>`; return html;
}
export function lbValue(e, view){
  if(view==="month") return (e.month===curMonth())? (e.xpMonth||0) : 0;
  if(view==="year")  return (e.year===curYear())?   (e.xpYear||0)  : 0;
  if(view==="all")   return e.xpAll||0;
  if(view==="time")  return (e.day===today())? (e.timeDay||0) : 0;
  return (e.day===today())? (e.xpDay||0) : 0;
}
function viewLeaderboard(){
  const me=myEntry(), view=App.lbView||"day", subj=App.lbSubject||null;
  const tabs=[["day","Today"],["month","Month"],["year","Year"],["all","All-time"],["time","Time"]];
  let board=(App.board && Array.isArray(App.board)) ? App.board.slice() : [];
  board=board.filter(e=>e.id!==me.id).concat([me]);
  // subject filter chips come from whoever is actually on the board
  const subjects=[...new Set(board.map(e=>e.subject).filter(s=>s&&s!=="—"))].sort();
  if(subj) board=board.filter(e=>e.subject===subj);
  board=board.sort((a,b)=>lbValue(b,view)-lbValue(a,view));
  const label=view==="day"?"today":view==="month"?"this month":view==="year"?"this year":"all-time";
  let html=`<div class="fade">
    <button class="btn-sm btn-ghost" data-action="nav" data-screen="home" style="margin-bottom:14px"><svg class="i" viewBox="0 0 24 24" style="width:15px;height:15px"><path d="M15 18l-6-6 6-6"/></svg> Home</button>
    <h2 class="serif" style="font-size:24px;font-weight:600">Leaderboard</h2>
    <div class="card pad" style="margin:8px 0 12px"><div class="row between">
      <div><div class="faint" style="font-size:11px;letter-spacing:.06em;text-transform:uppercase">You appear as</div><div style="font-weight:700;margin-top:2px">${esc(me.name)}</div></div>
      <button class="btn-sm btn-ghost" data-action="set-name">Shuffle</button>
    </div></div>
    <div class="seg" style="display:flex;width:100%;margin-bottom:10px">${tabs.map(([v,t])=>`<button class="segbtn ${view===v?'on':''}" data-action="lb-view" data-v="${v}" style="flex:1">${t}</button>`).join("")}</div>`;
  if(subjects.length>1){
    html+=`<div class="wrapflex" style="gap:6px;margin-bottom:12px">
      <button class="chip ${!subj?'on':''}" data-action="lb-subject" data-s="">All</button>
      ${subjects.map(s=>`<button class="chip ${subj===s?'on':''}" data-action="lb-subject" data-s="${esc(s)}">${esc(s)}</button>`).join("")}
    </div>`;
  }
  const _liveN=board.filter(e=>e.studyingNow).length;
  if(_liveN>0) html+=`<div class="card pad" style="margin-bottom:10px;border-left:3px solid var(--green)"><span style="color:var(--green);font-weight:700">\u{1F7E2} ${_liveN} studying right now</span></div>`;
  if(!board.length){ html+=`<div class="empty">No one studying ${esc(subj||"")} yet.</div>`; }
  board.forEach((e,i)=>{
    const you=e.id===me.id, val=lbValue(e,view), medal=i===0?"#d9a441":i===1?"#9fb0c0":i===2?"#c08457":null;
    const onFire=(e.week||0)>=3;
    html+=`<div class="card pad" style="margin-bottom:8px;${you?'border-color:var(--teal-dim);background:var(--teal-deep)':''}">
      <div class="row" style="gap:13px">
        <div class="rank" ${medal?`style="background:${medal}22;color:${medal}"`:''}>${i+1}</div>
        <div style="flex:1">
          <div class="row" style="gap:7px;align-items:center;flex-wrap:wrap"><span style="font-weight:700;font-size:14.5px">${esc(e.name||"Anon")}${you?' · you':''}</span>${onFire?`<span class="firebadge">🔥 ${e.week}d this week</span>`:''}${e.studyingNow?`<span class="firebadge" style="color:var(--green)">\u{1F7E2} studying${e.studyingSubject?" · "+esc(e.studyingSubject):""}</span>`:''}</div>
          <div class="row" style="gap:8px;margin-top:3px;flex-wrap:wrap">
            <span class="faint" style="font-size:12px">Lv ${e.level||1} · ${e.streak||0}🔥 streak</span>
            ${e.subject&&e.subject!=="—"?`<span class="subjtag">${esc(e.subject)}</span>`:''}
          </div>
        </div>
        <div class="mono" style="font-weight:800;color:var(--teal);text-align:right">${view==="time"?fmtHM(val):val}<div class="faint" style="font-size:10px;font-weight:600">${view==="time"?"studied today":"XP "+label}</div></div>
      </div>
    </div>`;
  });
  if(!DB.settings.groupEndpoint && !DB.settings.lbRepo){
    html+=`<div class="card pad" style="margin-top:6px"><div class="faint" style="font-size:13px;line-height:1.5">Right now this shows just you. Connect your group endpoint (Settings → maintainer → Leaderboard, or via the manifest) and everyone syncs automatically.</div></div>`;
  } else {
    html+=`<div class="faint" style="font-size:11.5px;text-align:center;margin-top:6px">Daily board resets at midnight · 🔥 = studied 3+ days this week · names are anonymous</div>`;
  }
  html+=`</div>`;
  return html;
}
export function ghSlug(s){ return (s||"user").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,40)||"user"; }
function b64(str){ return btoa(unescape(encodeURIComponent(str))); }
async function ghPushScore(){
  const repo=DB.settings.lbRepo, dir=DB.settings.lbDir||"scores", branch=DB.settings.lbBranch||"main";
  if(!repo || !ghToken) return false;
  const me=myEntry(); const path=dir+"/"+ghSlug(me.id)+".json";
  const url="https://api.github.com/repos/"+repo+"/contents/"+path;
  const H={Authorization:"Bearer "+ghToken, Accept:"application/vnd.github+json"};
  let sha=null;
  try{ const g=await fetch(url+"?ref="+encodeURIComponent(branch),{headers:H,cache:"no-store"}); if(g.ok){ sha=(await g.json()).sha; } }catch(e){}
  const body={message:"score "+me.id, content:b64(JSON.stringify(me,null,2)), branch};
  if(sha) body.sha=sha;
  try{ const r=await fetch(url,{method:"PUT",headers:H,body:JSON.stringify(body)}); return r.ok; }catch(e){ return false; }
}
async function ghReadBoard(){
  const repo=DB.settings.lbRepo, dir=DB.settings.lbDir||"scores", branch=DB.settings.lbBranch||"main";
  if(!repo) return null;
  const listUrl="https://api.github.com/repos/"+repo+"/contents/"+dir+"?ref="+encodeURIComponent(branch);
  const r=await fetch(listUrl,{cache:"no-store"}); if(!r.ok) return null;
  const files=await r.json(); const board=[];
  for(const f of (Array.isArray(files)?files:[])){ if(!/\.json$/i.test(f.name)||!f.download_url) continue;
    try{ const fr=await fetch(f.download_url,{cache:"no-store"}); if(fr.ok){ const e=await fr.json(); if(e&&typeof e.xp==="number") board.push(e); } }catch(_){}
  }
  return board;
}
let _boardPoll=null;
function startBoardPoll(){ if(_boardPoll) return; _boardPoll=setInterval(()=>{ if(App.screen==="leaderboard" && (DB.settings.groupEndpoint||DB.settings.lbRepo)){ syncBoard(); } else { stopBoardPoll(); } }, 12000); }
function stopBoardPoll(){ if(_boardPoll){ clearInterval(_boardPoll); _boardPoll=null; } }
async function syncBoard(){
  const ep=DB.settings.groupEndpoint;
  try{
    if(ep){
      await fetch(ep,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(myEntry())}).catch(()=>{});
      const r=await fetch(ep+(ep.indexOf("?")>=0?"&":"?")+"cb="+Date.now(),{cache:"no-store"}); if(r.ok){ App.board=await r.json(); }
    } else if(DB.settings.lbRepo){
      if(ghToken) await ghPushScore();
      const b=await ghReadBoard(); if(b) App.board=b;
    }
  }catch(e){}
  if(App.screen==="leaderboard") render();
}
function viewBuilder(){
  if(!App.builder) App.builder={subjects:new Set(BANK.map(p=>p.id)), count:10, timer:"total", minutes:15, pass:DB.settings.passMark, shuffle:true};
  const b=App.builder;
  const avail=BANK.filter(p=>b.subjects.has(p.id)).reduce((n,p)=>n+p.questions.length,0);
  let html=`<div class="fade">
    <button class="btn-sm btn-ghost" data-action="nav" data-screen="home" style="margin-bottom:14px"><svg class="i" viewBox="0 0 24 24" style="width:15px;height:15px"><path d="M15 18l-6-6 6-6"/></svg> Back</button>
    <h2 class="serif" style="font-size:24px;font-weight:600">Exam Simulation</h2>
    <p class="muted" style="font-size:14px;margin-top:4px">Build a timed mock from any topics. Answers stay locked until you submit.</p>

    <div class="sectlabel">Include subjects</div>`;
  BANK.forEach(p=>{
    const on=b.subjects.has(p.id);
    html+=`<div class="check ${on?'on':''}" data-action="exam-toggle-subject" data-subject="${p.id}" style="margin-bottom:8px">
      <div class="box">${on?'<svg class="i" viewBox="0 0 24 24" style="width:14px;height:14px;stroke:#04211e;stroke-width:3"><path d="M20 6 9 17l-5-5"/></svg>':''}</div>
      <div class="grow"><b style="color:${p.color}">${esc(p.title)}</b></div>
      <span class="faint" style="font-size:13px">${p.questions.length} Q</span>
    </div>`;
  });

  html+=`<div class="sectlabel">Number of questions (max ${avail})</div>
    <div class="wrapflex">`;
  const countOpts=[...new Set([5,10,20,30].filter(n=>n<avail))]; countOpts.push(avail);
  countOpts.forEach(n=>{
    const lbl = n===avail? "All ("+avail+")" : n;
    html+=`<button class="btn-ghost btn-sm" data-action="exam-count" data-n="${n}" style="${b.count===n?'border-color:var(--teal);color:var(--teal)':''}">${lbl}</button>`;
  });
  html+=`</div>`;

  html+=`<div class="sectlabel">Timer</div>
  <div class="seg" style="margin-bottom:10px">
    <button class="${b.timer==='total'?'on':''}" data-action="exam-timer" data-mode="total">Total time</button>
    <button class="${b.timer==='off'?'on':''}" data-action="exam-timer" data-mode="off">Untimed</button>
  </div>`;
  if(b.timer==="total"){
    html+=`<div class="wrapflex">`;
    [5,10,15,30].forEach(m=>html+=`<button class="btn-ghost btn-sm" data-action="exam-min" data-m="${m}" style="${b.minutes===m?'border-color:var(--teal);color:var(--teal)':''}">${m} min</button>`);
    html+=`</div>`;
  }

  html+=`<div class="sectlabel">Options</div>
  <div class="check ${b.shuffle?'on':''}" data-action="exam-shuffle">
    <div class="box">${b.shuffle?'<svg class="i" viewBox="0 0 24 24" style="width:14px;height:14px;stroke:#04211e;stroke-width:3"><path d="M20 6 9 17l-5-5"/></svg>':''}</div>
    <div class="grow"><b>Shuffle choice order</b></div>
  </div>
  <div class="row between card pad" style="margin-top:8px">
    <b>Pass mark</b>
    <div class="row" style="gap:8px">
      <button class="iconbtn" data-action="exam-pass" data-d="-5">–</button>
      <span class="mono" style="font-size:16px;min-width:46px;text-align:center">${b.pass}%</span>
      <button class="iconbtn" data-action="exam-pass" data-d="5">+</button>
    </div>
  </div>
  </div>`;

  setFoot(`<button class="btn btn-primary" data-action="exam-start" ${avail&&b.count?'':'disabled'}>Start exam · ${b.count} Q${b.timer==='total'?' · '+b.minutes+' min':''}</button>`);
  return html;
}

/* ---------- EXAM RUNNER ---------- */
function startExam(){
  const b=App.builder;
  let ids=[];
  BANK.filter(p=>b.subjects.has(p.id)).forEach(p=>p.questions.forEach(q=>{ if(q.type!=="sa") ids.push(q.id); }));
  ids.sort(()=>Math.random()-0.5);
  ids=ids.slice(0,b.count);
  const order={};
  ids.forEach(id=>{ const cs=[...QMAP[id].choices]; if(b.shuffle) cs.sort(()=>Math.random()-0.5); order[id]=cs; });
  App.exam={ ids, order, i:0, answers:{}, flags:new Set(), timerMode:b.timer, timeLeft:b.timer==="total"?b.minutes*60:0, total:b.timer==="total"?b.minutes*60:0, startedAt:Date.now(), timerId:null };
  App.examReview=false;
  App.screen="exam-runner"; render();
  if(b.timer==="total"){
    App.exam.timerId=setInterval(()=>{
      App.exam.timeLeft--;
      const el=$("exam-timer");
      if(el){ el.textContent=fmtTime(App.exam.timeLeft); el.classList.toggle("warn",App.exam.timeLeft<=60); }
      if(App.exam.timeLeft<=0) submitExam(true);
    },1000);
  }
}
function viewExam(){
  const e=App.exam, id=e.ids[e.i], q=QMAP[id], chosen=e.answers[id], flagged=e.flags.has(id);
  const answered=Object.keys(e.answers).length;
  let html=`<div class="fade">
    <div class="row between" style="margin-bottom:12px">
      <button class="btn-sm btn-ghost" data-action="exam-quit"><svg class="i" viewBox="0 0 24 24" style="width:15px;height:15px"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
      <span class="timer ${e.timerMode==='total'&&e.timeLeft<=60?'warn':''}" id="exam-timer">${e.timerMode==='total'?fmtTime(e.timeLeft):'∞'}</span>
      <span class="faint mono" style="font-size:13px">${answered}/${e.ids.length}</span>
    </div>

    <div class="palette">`;
  e.ids.forEach((qid,idx)=>{
    let cls="pcell";
    if(e.answers[qid]) cls+=" answered";
    if(idx===e.i) cls+=" current";
    if(e.flags.has(qid)) cls+=" flagged";
    html+=`<div class="${cls}" data-action="exam-jump" data-i="${idx}">${idx+1}</div>`;
  });
  html+=`</div>`;

  html+=`<div class="qmeta" style="margin-top:18px">
    <span class="pill" style="color:${BANK.find(p=>p.id===q.packId).color}">${esc(q.packTitle)}</span>
    <span class="faint mono" style="font-size:12px;align-self:center">Q${e.i+1}</span>
    <button class="pill ${flagged?'amber':''}" data-action="exam-flag" style="margin-left:auto;cursor:pointer">${flagged?'★ Flagged':'☆ Flag'}</button>
  </div>
  <div class="stem">${stripBold(q.stem)}</div>
  <div class="choices">`;
  e.order[id].forEach(c=>{
    html+=`<button class="choice ${chosen===c.l?'sel':''}" data-action="exam-select" data-label="${c.l}">
      <span class="lab">${c.l}</span><span>${esc(c.t)}</span></button>`;
  });
  html+=`</div></div>`;

  const last=e.i===e.ids.length-1;
  setFoot(`
    <button class="btn btn-ghost" data-action="exam-prev" ${e.i===0?'disabled':''} style="flex:0 0 90px">Prev</button>
    ${last
      ? `<button class="btn btn-primary" data-action="exam-submit">Submit exam</button>`
      : `<button class="btn btn-ghost" data-action="exam-next">Next</button>`}
  `);
  return html;
}
export function submitExam(auto){
  const e=App.exam;
  if(e.timerId) clearInterval(e.timerId);
  let score=0; const answers=[], byTopic={};
  e.ids.forEach(id=>{
    const q=QMAP[id], chosen=e.answers[id]||null, cl=correctLabel(q), ok=chosen===cl;
    if(ok) score++;
    answers.push({qid:id, chosen, correct:cl, ok, flagged:e.flags.has(id)});
    byTopic[q.topic]=byTopic[q.topic]||{c:0,t:0}; byTopic[q.topic].t++; if(ok)byTopic[q.topic].c++;
    // feed progress memory (not SRS)
    if(chosen) recordAttempt(q, chosen, null);
  });
  const total=e.ids.length, pct=Math.round(score/total*100), pass=DB.settings.passMark;
  const result={ examId:"exam-"+Date.now(), date:today(), score, total, percent:pct,
    passed:pct>=pass, timeUsedSec: Math.round((Date.now()-e.startedAt)/1000),
    byTopic:Object.entries(byTopic).map(([k,v])=>({topic:k,correct:v.c,total:v.t})), answers, auto:!!auto };
  DB.exams.push({examId:result.examId,date:result.date,percent:pct,score,total}); save.exams();
  awardXP(score*10 + (total-score)*4);
  evaluateAchievements();
  App.examResult=result; App.examReview=false; App.screen="exam-results"; render();
  if(result.passed){ confetti(); cue("done"); }
}

/* ---------- EXAM RESULTS ---------- */
function viewResults(){
  const r=App.examResult;
  if(App.examReview) return viewExamReview();
  let html=`<div class="fade" style="text-align:center;padding-top:8px">
    ${r.auto?'<span class="pill amber" style="margin-bottom:14px;display:inline-block">⏱ Time expired — auto-submitted</span>':''}
    <div class="ring" style="--p:${r.percent}">
      <div class="in"><div><div class="scorebig" style="color:${r.passed?'var(--green)':'var(--red)'}">${r.percent}%</div></div></div>
    </div>
    <h2 class="serif" style="font-size:23px;font-weight:600;margin-top:16px">${r.passed?'Pass':'Below pass mark'}</h2>
    <p class="muted">${r.score} / ${r.total} correct · ${fmtTime(r.timeUsedSec)} · pass mark ${DB.settings.passMark}%</p>
  </div>

  <div class="sectlabel">By topic</div><div class="card pad" style="padding:6px 14px">`;
  r.byTopic.forEach((t,idx)=>{
    const pct=Math.round(t.correct/t.total*100);
    html+=`<div style="padding:11px 0;${idx?'border-top:1px solid var(--line-soft)':''}">
      <div class="row between" style="font-size:14px;margin-bottom:6px"><span>${esc(t.topic)}</span><span class="mono faint">${t.correct}/${t.total}</span></div>
      <div class="progressbar" style="margin:0"><i style="width:${pct}%;background:${pct>=DB.settings.passMark?'linear-gradient(90deg,var(--teal-dim),var(--green))':'linear-gradient(90deg,#7a3b40,var(--red))'}"></i></div>
    </div>`;
  });
  html+=`</div>`;

  const wrong=r.answers.filter(a=>!a.ok).length;
  let foot=`<button class="btn btn-ghost" data-action="exam-review">Review answers</button>`;
  if(wrong) foot=`<button class="btn btn-ghost" data-action="exam-review" style="flex:1">Review (${r.total})</button>
    <button class="btn btn-primary" data-action="exam-push-srs" style="flex:1">Add ${wrong} misses to review</button>`;
  setFoot(foot);
  html+=`<div style="height:10px"></div><button class="btn btn-ghost" data-action="nav" data-screen="home">Back to home</button>`;
  return html;
}
function viewExamReview(){
  const r=App.examResult;
  let html=`<div class="fade">
    <button class="btn-sm btn-ghost" data-action="exam-results-back" style="margin-bottom:14px"><svg class="i" viewBox="0 0 24 24" style="width:15px;height:15px"><path d="M15 18l-6-6 6-6"/></svg> Results</button>
    <h2 class="serif" style="font-size:22px;font-weight:600">Review</h2>`;
  r.answers.forEach((a,idx)=>{
    const q=QMAP[a.qid];
    html+=`<div class="card pad" style="margin-top:14px">
      <div class="row between" style="margin-bottom:8px">
        <span class="faint mono" style="font-size:12px">Q${idx+1} · ${esc(q.topic)}</span>
        <span class="pill" style="color:${a.ok?'var(--green)':'var(--red)'};border-color:${a.ok?'#2c5f44':'#6e2b30'}">${a.ok?'Correct':a.chosen?'Wrong':'Blank'}</span>
      </div>
      <div class="stem" style="font-size:15px">${q.stem}</div>
      ${renderReveal(q, a.chosen, {review:true})}
      <div style="text-align:center;margin-top:6px"><button class="reportlink" data-action="report-open" data-qid="${q.id}">⚑ Report an issue</button></div>
    </div>`;
  });
  html+=`</div>`;
  setFoot(`<button class="btn btn-ghost" data-action="exam-results-back">Back to results</button>`);
  return html;
}

/* ---------- STATS ---------- */
function viewStats(){
  const qs=DB.progress.questions, ids=Object.keys(qs);
  let att=0, corr=0; ids.forEach(id=>{att+=qs[id].seen;corr+=qs[id].correct;});
  const acc=att?Math.round(corr/att*100):0;
  let html=`<div class="fade">
    <button class="btn-sm btn-ghost" data-action="nav" data-screen="home" style="margin-bottom:14px"><svg class="i" viewBox="0 0 24 24" style="width:15px;height:15px"><path d="M15 18l-6-6 6-6"/></svg> Back</button>
    <h2 class="serif" style="font-size:24px;font-weight:600">Your progress</h2>
    <div class="stat3 stagger" style="margin-top:14px">
      <div class="card"><div class="n teal">${acc}%</div><div class="l">Accuracy</div></div>
      <div class="card"><div class="n">${att}</div><div class="l">Attempts</div></div>
      <div class="card"><div class="n amber">${DB.progress.streak?.current||0}</div><div class="l">Streak</div></div>
    </div>`;

  // confidence calibration
  let _sc=0,_st=0,_uc=0,_ut=0,_cw=0;
  ids.forEach(id=>{ (qs[id].history||[]).forEach(h=>{ if(h.confidence==="sure"){ _st++; if(h.correct)_sc++; else _cw++; } else if(h.confidence==="unsure"){ _ut++; if(h.correct)_uc++; } }); });
  if(_st+_ut>0){ html+=`<div class="sectlabel">Confidence calibration</div><div class="card pad">
    <div class="row between" style="font-size:13.5px"><span>When you felt <b style="color:var(--green)">confident</b></span><span class="mono">${_st?Math.round(_sc/_st*100):0}% right · ${_st}</span></div>
    <div class="row between" style="font-size:13.5px;margin-top:8px"><span>When <b style="color:var(--amber)">not sure</b></span><span class="mono">${_ut?Math.round(_uc/_ut*100):0}% right · ${_ut}</span></div>
    ${_cw>0?`<div class="row between" style="font-size:13.5px;margin-top:8px"><span style="color:var(--red)">⚠️ Confidently wrong</span><span class="mono" style="color:var(--red)">${_cw}</span></div>`:''}
    <div class="faint" style="font-size:11.5px;margin-top:10px">"Confidently wrong" = you were sure but missed it — the highest-value gaps to review.</div>
  </div>`; }
  html+=`<div class="sectlabel">Mastery by subject</div><div class="card pad" style="padding:6px 14px">`;
  BANK.forEach((p,idx)=>{
    const tot=p.questions.length, seen=seenCount(p.id), mast=masteredCount(p.id);
    html+=`<div style="padding:12px 0;${idx?'border-top:1px solid var(--line-soft)':''}">
      <div class="row between" style="font-size:14px;margin-bottom:6px">
        <span style="color:${p.color};font-weight:600">${esc(p.title)}</span>
        <span class="mono faint" style="font-size:12px">${mast} mastered · ${seen}/${tot} seen</span>
      </div>
      <div class="progressbar" style="margin:0">
        <i style="width:${seen/tot*100}%"></i>
      </div>
    </div>`;
  });
  html+=`</div>`;

  // accuracy by topic (heatmap-style chips, weakest first)
  const tmap=new Map();
  allQs().forEach(q=>{ const p=qs[q.id]; if(!p||!p.seen) return; const k=qSys(q)+" · "+(q.topic||"General");
    const o=tmap.get(k)||{seen:0,correct:0}; o.seen+=p.seen; o.correct+=p.correct; tmap.set(k,o); });
  const tops=[...tmap.entries()].map(([k,v])=>({t:k,acc:v.correct/v.seen,seen:v.seen})).filter(x=>x.seen>=3).sort((a,b)=>a.acc-b.acc);
  if(tops.length){
    html+=`<div class="sectlabel">Accuracy by topic</div><div class="card pad"><div class="faint" style="font-size:12px;margin-bottom:10px">Weakest first — tap a colour to gauge where to focus.</div><div class="wrapflex" style="gap:7px">`;
    tops.slice(0,30).forEach(x=>{
      const pct=Math.round(x.acc*100);
      const bg = pct<50?'var(--red-deep)':pct<75?'var(--amber-deep)':'var(--green-deep)';
      const fg = pct<50?'var(--red)':pct<75?'var(--amber)':'var(--green)';
      html+=`<span class="heat" style="background:${bg};color:${fg}" title="${esc(x.t)}">${esc(x.t.split(" · ").pop())} ${pct}%</span>`;
    });
    html+=`</div>${tops.length>30?`<div class="faint" style="font-size:11px;margin-top:8px">+${tops.length-30} more</div>`:''}</div>`;
  }

  // upcoming reviews forecast
  const tdy=today(); const d7=new Date(); d7.setDate(d7.getDate()+7); const in7=d7.toISOString().slice(0,10);
  let dueT=0, due7=0, sched=0, freshN=0;
  allQs().forEach(q=>{ const p=qs[q.id]; if(p&&p.srs&&p.srs.due){ sched++; if(p.srs.due<=tdy)dueT++; if(p.srs.due<=in7)due7++; } else if(!p){ freshN++; } });
  html+=`<div class="sectlabel">Upcoming reviews</div>
  <div class="stat3 stagger">
    <div class="card"><div class="n teal">${dueT}</div><div class="l">Due today</div></div>
    <div class="card"><div class="n amber">${due7}</div><div class="l">Next 7 days</div></div>
    <div class="card"><div class="n">${freshN}</div><div class="l">Unseen</div></div>
  </div>
  <div class="faint" style="font-size:12px;margin:8px 2px 0">${sched} cards in your spaced-repetition schedule.</div>`;

  // exam history
  if(DB.exams.length){
    const max=Math.max(...DB.exams.map(e=>e.percent),100);
    html+=`<div class="sectlabel">Exam scores</div><div class="card pad">
      <div style="display:flex;align-items:flex-end;gap:8px;height:120px">`;
    DB.exams.slice(-10).forEach(ex=>{
      html+=`<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;justify-content:flex-end;height:100%">
        <div style="width:100%;border-radius:6px 6px 0 0;height:${ex.percent}%;background:${ex.percent>=DB.settings.passMark?'linear-gradient(var(--teal),var(--teal-dim))':'linear-gradient(var(--red),#7a3b40)'}"></div>
        <span class="mono faint" style="font-size:10px">${ex.percent}</span>
      </div>`;
    });
    html+=`</div></div>`;
  }

  // marked
  const marked=ids.filter(id=>qs[id].marked);
  if(marked.length){
    html+=`<div class="sectlabel">Marked for review (${marked.length})</div><div class="card pad" style="padding:4px 14px">`;
    marked.forEach((id,idx)=>{ const q=QMAP[id];
      html+=`<div class="row" style="gap:9px;padding:11px 0;${idx?'border-top:1px solid var(--line-soft)':''}">
        <svg class="i" viewBox="0 0 24 24" style="width:15px;height:15px;fill:var(--amber);stroke:var(--amber);flex:none"><path d="M5 3v18l7-5 7 5V3z"/></svg>
        <span style="font-size:13.5px">${esc(q.topic)} — ${esc((q.choices.find(c=>c.correct)||{}).t || stripBold(q.stem).replace(/<[^>]+>/g,'').slice(0,42))}</span></div>`;
    });
    html+=`</div>`;
  }

  if(!ids.length) html+=`<div class="empty">No data yet — answer a few questions and your progress will appear here, saved across sessions.</div>`;
  html+=`</div>`;
  return html;
}

/* ---------- SETTINGS ---------- */
function viewSettings(){
  const reportsHTML = (function(){
    if(!DB.reports.length) return `<div class="empty" style="padding:16px">No reports yet. Tap “⚑ Report an issue” on any question.</div>`;
    let h=`<div class="card pad" style="padding:4px 14px">`;
    DB.reports.slice().reverse().forEach((r,idx)=>{
      h+=`<div style="padding:11px 0;${idx?'border-top:1px solid var(--line-soft)':''}">
        <div class="row between" style="font-size:13.5px"><b>${esc(r.type)}</b><span class="faint mono" style="font-size:11px">${esc(r.date)}</span></div>
        <div class="faint" style="font-size:12.5px;margin-top:2px">${esc(r.subject)} · ${esc(r.topic)}</div>
        ${r.note?`<div class="muted" style="font-size:13px;margin-top:5px">${esc(r.note)}</div>`:""}
      </div>`;
    });
    h+=`</div><div style="height:8px"></div>
      <button class="btn btn-ghost" data-action="export-reports">Export reports (JSON)</button>
      <div style="height:8px"></div>
      <button class="btn btn-ghost" data-action="clear-reports" style="border-color:#6b541f;color:var(--amber)">Clear reports</button>`;
    return h;
  })();
  let html=`<div class="fade">
    <button class="btn-sm btn-ghost" data-action="nav" data-screen="home" style="margin-bottom:14px"><svg class="i" viewBox="0 0 24 24" style="width:15px;height:15px"><path d="M15 18l-6-6 6-6"/></svg> Back</button>
    <h2 class="serif" style="font-size:24px;font-weight:600">Settings</h2>

    <div class="sectlabel">Recall</div>
    <div class="row between card pad">
      <div><b>New cards / day</b><div class="faint" style="font-size:12.5px">Smart Review limit</div></div>
      <div class="row" style="gap:8px">
        <button class="iconbtn" data-action="set-newperday" data-d="-5">–</button>
        <span class="mono" style="font-size:16px;min-width:36px;text-align:center">${DB.settings.newPerDay}</span>
        <button class="iconbtn" data-action="set-newperday" data-d="5">+</button>
      </div>
    </div>
    <div class="row between card pad" style="margin-top:8px">
      <div><b>Pass mark</b><div class="faint" style="font-size:12.5px">Exam Simulation</div></div>
      <div class="row" style="gap:8px">
        <button class="iconbtn" data-action="set-pass" data-d="-5">–</button>
        <span class="mono" style="font-size:16px;min-width:46px;text-align:center">${DB.settings.passMark}%</span>
        <button class="iconbtn" data-action="set-pass" data-d="5">+</button>
      </div>
    </div>

    <div class="row between card pad" style="margin-top:8px">
      <div><b>Daily goal</b><div class="faint" style="font-size:12.5px">Questions per day</div></div>
      <div class="row" style="gap:8px">
        <button class="iconbtn" data-action="set-goal" data-d="-5">–</button>
        <span class="mono" style="font-size:16px;min-width:36px;text-align:center">${DB.settings.dailyGoal||20}</span>
        <button class="iconbtn" data-action="set-goal" data-d="5">+</button>
      </div>
    </div>
    <div class="row between card pad" style="margin-top:8px">
      <div><b>Exam date</b><div class="faint" style="font-size:12.5px">For the D-day countdown</div></div>
      <div class="row" style="gap:8px"><input type="date" id="examdate" class="inp" value="${esc(DB.settings.examDate||'')}" style="width:auto;padding:7px 9px"><button class="btn-sm btn-primary" data-action="set-examdate">Set</button></div>
    </div>
    <div class="row between card pad" style="margin-top:8px">
      <div><b>Sounds</b><div class="faint" style="font-size:12.5px">Soft cues for answers, level-ups, goals</div></div>
      <button class="switch ${DB.settings.sounds?'on':''}" data-action="set-sound" aria-label="Toggle sounds"><span class="knob"></span></button>
    </div>
    <div class="row between card pad" style="margin-top:8px">
      <div><b>Reveal on pick</b><div class="faint" style="font-size:12.5px">Show the answer the instant you choose (off = tap Reveal, and rate your confidence first)</div></div>
      <button class="switch ${DB.settings.revealOnPick!==false?'on':''}" data-action="set-revealonpick" aria-label="Toggle reveal on pick"><span class="knob"></span></button>
    </div>

    <div class="sectlabel">Study reminders</div>
    ${(function(){
      const N=notifCfg(), sup=notifSupported(), perm=notifPermission(), trig=triggersSupported();
      let status;
      if(!sup) status="Open the app from its web link (https) to use reminders — they're unavailable on a downloaded file.";
      else if(perm==="denied") status="Notifications are blocked. Allow them for this site in your browser settings, then re-enable.";
      else if(N.enabled && perm==="granted") status = trig ? "On — scheduled reminders fire even when the app is closed." : "On — this browser (e.g. iOS) nudges you only while the app is open.";
      else status="Get a gentle nudge to keep up your reviews, streak and exam countdown.";
      let h=`<div class="row between card pad">
        <div><b>Enable reminders</b><div class="faint" style="font-size:12.5px">${esc(status)}</div></div>
        <button class="switch ${N.enabled&&perm==="granted"?"on":""}" data-action="notif-enable" aria-label="Toggle reminders"><span class="knob"></span></button>
      </div>`;
      if(N.enabled && perm==="granted"){
        h+=`<div class="row between card pad" style="margin-top:8px">
          <div><b>Daily reminder time</b><div class="faint" style="font-size:12.5px">When to send the daily nudge</div></div>
          <div class="row" style="gap:8px"><input type="time" id="notiftime" class="inp" value="${esc(N.time||"19:00")}" style="width:auto;padding:7px 9px"><button class="btn-sm btn-primary" data-action="notif-time">Set</button></div>
        </div>`;
        [["daily","Daily study reminder","A nudge at your set time each day"],["due","Cards due for review","Tells you when reviews are waiting"],["streak","Streak saver","Evening reminder if you haven't studied yet"],["exam","Exam countdown","D-day nudge as your exam approaches"]].forEach(function(r){
          h+=`<div class="row between card pad" style="margin-top:8px">
            <div><b>${r[1]}</b><div class="faint" style="font-size:12.5px">${r[2]}</div></div>
            <button class="switch ${N[r[0]]!==false?"on":""}" data-action="notif-toggle" data-k="${r[0]}" aria-label="Toggle ${r[1]}"><span class="knob"></span></button>
          </div>`;
        });
        h+=`<div style="height:8px"></div><button class="btn btn-ghost" data-action="notif-test">Send a test reminder</button>`;
      }
      return h;
    })()}

    <div class="sectlabel">Appearance</div>
    <div class="row between card pad" style="margin-bottom:8px">
      <div><b>Theme</b><div class="faint" style="font-size:12.5px">Light or dark — your choice</div></div>
      <div class="seg">
        <button class="segbtn ${DB.settings.theme!=='light'?'on':''}" data-action="set-theme" data-theme="dark">Dark</button>
        <button class="segbtn ${DB.settings.theme==='light'?'on':''}" data-action="set-theme" data-theme="light">Light</button>
      </div>
    </div>
    <div class="card pad">
      <div class="faint" style="font-size:12.5px;margin-bottom:10px">Background — pick a theme, or use your own image</div>
      <div class="wrapflex">
        ${Object.entries(WALLPAPERS).map(([id,w])=>`<button class="wallsw ${DB.settings.wallpaper===id?'on':''}" data-action="set-wall" data-id="${id}" title="${w.name}" style="background:${w[wallTheme()]}"></button>`).join("")}
        <button class="wallsw ${DB.settings.wallpaper==='custom'?'on':''}" data-action="wall-upload" title="Custom image" style="display:grid;place-items:center;background:var(--surface-2)">+</button>
      </div>
      <input type="file" id="wallfile" accept="image/*" style="display:none">
      ${DB.settings.wallpaper==='custom'?`<div style="height:8px"></div><button class="btn btn-ghost" data-action="wall-remove">Remove custom image</button>`:''}
    </div>

    <div class="sectlabel">Progress memory</div>
    <p class="muted" style="font-size:13.5px;margin:0 2px 10px">Your progress is saved automatically and persists when you close and reopen the app. Export a backup or move it to another device below.</p>
    <button class="btn btn-ghost" data-action="export"><svg class="i" viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg> Export progress (JSON)</button>
    <div style="height:8px"></div>
    <button class="btn btn-ghost" data-action="import-toggle"><svg class="i" viewBox="0 0 24 24"><path d="M12 21V9M7 14l5-5 5 5M5 3h14"/></svg> Import progress</button>
    <div id="importbox" style="display:none;margin-top:10px">
      <textarea class="inp" id="importtext" placeholder="Paste exported JSON here…"></textarea>
      <div style="height:8px"></div>
      <button class="btn btn-primary" data-action="import-apply">Apply import</button>
    </div>

    ${DB.settings.maintainer ? `
    <div class="sectlabel">Bank · maintainer</div>
    <div class="card pad">
      <div class="row between"><b>Loaded questions</b><span class="mono faint">${Object.keys(QMAP).length} across ${BANK.length} packs</span></div>
      <div class="faint" style="font-size:12.5px;margin:6px 0 12px">Sync your bank from a hosted GitHub manifest — edit one JSON file and every device updates. (Design doc §2.)</div>
      <input class="inp" id="bankurl" placeholder="https://you.github.io/medcall-bank/" value="${esc(DB.settings.bankUrl||defaultBase())}">
      <div style="height:8px"></div>
      <button class="btn btn-primary" data-action="sync-bank">Sync now</button>
      ${DB.settings.lastSync?`<div class="faint" style="font-size:12px;text-align:center;margin-top:8px">Last sync: ${esc(DB.settings.lastSync)}</div>`:""}
    </div>
    <div class="sectlabel">Leaderboard · maintainer</div>
    <div class="card pad">
      <div class="faint" style="font-size:12.5px;margin-bottom:10px">Group leaderboard via your GitHub repo. It reads everyone's scores from a <span class="mono">scores/</span> folder (public — automatic, no token needed). To let <b>this device post your score</b>, add a fine-grained token with <b>Contents: write</b> on that repo. The token is stored only on this device, never in the app code — but a token can edit the repo, so use your own and only share it within your group.</div>
      <input class="inp" id="lbrepo" placeholder="owner/repo  ·  e.g. Fulcrum003/medcall-bank" value="${esc(DB.settings.lbRepo||"")}">
      <div style="height:8px"></div>
      <button class="btn btn-primary" data-action="save-lb">Save leaderboard repo</button>
      <div style="height:8px"></div>
      <button class="btn btn-ghost" data-action="set-token">${ghToken?"Replace":"Add"} GitHub token (this device)</button>
      ${ghToken?`<div class="faint" style="font-size:12px;text-align:center;margin-top:8px">Token set on this device · <button class="reportlink" data-action="clear-token">remove</button></div>`:""}
      <div style="height:8px"></div>
      <button class="btn btn-ghost" data-action="push-score">Post my score now</button>
    </div>
    <div class="sectlabel">Reports inbox · maintainer</div>
    <button class="btn btn-ghost" data-action="open-reports-inbox"><svg class="i" viewBox="0 0 24 24"><path d="M4 5h16v11H6l-2 3V5z"/></svg> Open reports inbox${unreadReports()>0?` · <span class="badge due">${unreadReports()} new</span>`:""}</button>
    <div class="row between card pad" style="margin-top:8px">
      <div><b>Notify me about new reports</b><div class="faint" style="font-size:12.5px">A notification when you open the app and new reports have arrived</div></div>
      <button class="switch ${DB.settings.notifyReports!==false?'on':''}" data-action="notif-reports" aria-label="Toggle report alerts"><span class="knob"></span></button>
    </div>
    <div class="faint" style="font-size:12px;margin-top:6px">Reads everyone's reports and shares your in-app question fixes via your Google Script (needs the <span class="mono">?reports=1</span> + <span class="mono">?edits=1</span> doGet branches and the doPost edit branch — see the setup snippet).</div>
    <div style="height:10px"></div>
    <button class="btn btn-ghost" data-action="nav" data-screen="repair"><svg class="i" viewBox="0 0 24 24"><path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> Bank health check</button>
    <div style="height:10px"></div>
    <button class="btn btn-ghost" data-action="maint-lock">Hide maintainer tools</button>
    ` : ``}

    <div class="sectlabel">Export to Anki</div>
    <p class="muted" style="font-size:13px;margin:0 2px 10px">Download a deck as a .txt (Front/Back). In Anki: <b>File → Import</b>, type <b>Basic</b>, fields separated by <b>Tab</b>, allow HTML.</p>
    <button class="btn btn-ghost" data-action="export-anki-all"><svg class="i" viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg> Export ALL questions to Anki</button>
    <div style="height:8px"></div>
    <button class="btn btn-ghost" data-action="export-anki-mistakes">Export my mistakes to Anki</button>
    <div class="sectlabel">Issue reports (${DB.reports.length})</div>
    ${reportsHTML}

    <div class="sectlabel">Danger zone</div>
    <button class="btn btn-ghost" data-action="reset" style="border-color:#6e2b30;color:var(--red)">Reset all progress</button>

    <div class="empty" style="padding-top:24px" data-action="maint-tap">MedCall · v1.3<br>Storage: ${STORE.kind==='local'?'saved on this device':STORE.kind==='artifact'?'saved (preview)':'this session only'}.</div>
  </div>`;
  return html;
}

/* ============================================================
   MAINTAINER · BANK HEALTH (live structural scan of synced data)
   ============================================================ */
function scanBank(){
  const errs=[], warns=[], ids={};
  BANK.forEach(pack=>{
    (pack.questions||[]).forEach((q,i)=>{
      const where=`${pack.title||pack.id} Q${i+1}`;
      if(ids[q.id]) errs.push(`${where}: duplicate id "${q.id}" (also ${ids[q.id]})`); else ids[q.id]=where;
      if(!q.stem || !String(q.stem).trim()) errs.push(`${where} [${q.id}]: empty stem`);
      if(q.type==='sa'){ if(!q.modelAnswer || !String(q.modelAnswer).trim()) warns.push(`${where} [${q.id}]: short-answer with no model answer`); return; }
      const ch=q.choices||[];
      const nc=ch.filter(c=>c.correct).length;
      if(nc!==1) errs.push(`${where} [${q.id}]: ${nc} correct choices (need exactly 1)`);
      if(ch.length<2) warns.push(`${where} [${q.id}]: fewer than 2 choices`);
      ch.forEach(c=>{ if(!c.t || !String(c.t).trim()) errs.push(`${where} [${q.id}]: empty text on choice ${c.l}`); });
      const labs=ch.map(c=>c.l); if(new Set(labs).size!==labs.length) errs.push(`${where} [${q.id}]: duplicate choice labels`);
      if(q.flag) warns.push(`${where} [${q.id}]: flagged ${(q.flag.severity||'').trim()}`.trim());
    });
  });
  return {errs, warns, total:Object.keys(ids).length, packs:BANK.length};
}
function viewRepair(){
  const r=scanBank();
  const rows=(arr,col)=>arr.map((x,i)=>`<div style="padding:8px 11px;font-size:12.5px;${i?'border-top:1px solid var(--line-soft);':''}border-left:3px solid ${col}">${esc(x)}</div>`).join('');
  const store = App.persisted ? 'persisted (protected from eviction)' : STORE.kind==='local' ? 'saved on this device' : STORE.kind==='artifact' ? 'saved (preview)' : 'this session only';
  let html=`<div class="fade">
    <button class="btn-sm btn-ghost" data-action="nav" data-screen="settings" style="margin-bottom:14px"><svg class="i" viewBox="0 0 24 24" style="width:15px;height:15px"><path d="M15 18l-6-6 6-6"/></svg> Settings</button>
    <h2 class="serif" style="font-size:24px;font-weight:600">Bank health check</h2>
    <p class="muted" style="font-size:13.5px;margin-top:2px">Live scan of ${r.total} questions across ${r.packs} loaded packs. Storage: ${store}.</p>
    <div class="stat3 stagger" style="margin-top:12px">
      <div class="card"><div class="n ${r.errs.length?'red':'green'}">${r.errs.length}</div><div class="l">Errors</div></div>
      <div class="card"><div class="n amber">${r.warns.length}</div><div class="l">Warnings</div></div>
      <div class="card"><div class="n green">${r.total}</div><div class="l">Questions</div></div>
    </div>`;
  if(!r.errs.length) html+=`<div class="ansbox" style="margin-top:14px"><div class="k">All clear</div><div class="v">No structural errors in the loaded bank ✓</div></div>`;
  else html+=`<div class="sectlabel">Errors — fix in source JSON</div><div class="card" style="overflow:hidden">${rows(r.errs,'var(--red)')}</div>`;
  if(r.warns.length){ const show=r.warns.slice(0,150);
    html+=`<div class="sectlabel">Warnings (${r.warns.length})</div><div class="card" style="overflow:hidden">${rows(show,'var(--amber)')}${r.warns.length>show.length?`<div class="faint" style="padding:8px 11px;font-size:12px">…and ${r.warns.length-show.length} more (export for the full list)</div>`:''}</div>`; }
  html+=`<div style="height:12px"></div><button class="btn btn-ghost" data-action="repair-export"><svg class="i" viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg> Export full report (JSON)</button></div>`;
  return html;
}

/* ============================================================
   FOOTER
   ============================================================ */
function setFoot(inner){
  if(!inner) return;
  let f=document.createElement("div"); f.id="foot"; f.className="foot";
  f.innerHTML=`<div class="foot-in">${inner}</div>`;
  document.body.appendChild(f);
}

/* ============================================================
   EVENT DELEGATION
   ============================================================ */
document.body.addEventListener("click", async e=>{
  const t=e.target.closest("[data-action]"); if(!t) return;
  const a=t.dataset.action;

  if(a==="maint-tap"){
    maintTaps++; clearTimeout(maintTapT); maintTapT=setTimeout(()=>{maintTaps=0;},1500);
    if(maintTaps>=5){ maintTaps=0; DB.settings.maintainer=!DB.settings.maintainer; save.settings(); render(); toast(DB.settings.maintainer?"Maintainer tools unlocked":"Maintainer tools hidden"); }
    return;
  }
  if(a==="maint-lock"){ DB.settings.maintainer=false; save.settings(); render(); toast("Maintainer tools hidden"); return; }

  if(a==="sync-bank"){
    const url=($("bankurl")?.value||"").trim();
    DB.settings.bankUrl=url; save.settings();
    if(!url){ toast("Enter a source URL"); return; }
    toast("Syncing…");
    try{ const n=await syncBank(url); DB.settings.lastSync=today()+" · "+n+" Q"; save.settings(); App.screen="home"; render(); toast("Synced "+n+" questions ✓"); }
    catch(err){ toast("Couldn't reach source — using bundled bank"); }
    return;
  }

  // leaderboard (maintainer)
  if(a==="save-lb"){ DB.settings.lbRepo=($("lbrepo")?.value||"").trim(); save.settings(); render(); toast(DB.settings.lbRepo?"Leaderboard repo saved":"Cleared"); if(DB.settings.lbRepo) syncBoard(); return; }
  if(a==="set-token"){ const v=(prompt("Paste a GitHub fine-grained token (Contents: write on your repo). Stored on this device only:")||"").trim(); if(v){ ghToken=v; wsSet("medrecall:ghtoken:v1", v); render(); toast("Token saved on this device"); } return; }
  if(a==="clear-token"){ ghToken=null; wsSet("medrecall:ghtoken:v1", null); render(); toast("Token removed"); return; }
  if(a==="push-score"){ if(!DB.settings.lbRepo){ toast("Save your repo first"); return; } if(!ghToken){ toast("Add a token to post"); return; } toast("Posting…"); const ok=await ghPushScore(); toast(ok?"Score posted ✓":"Couldn't post — check token/repo"); if(ok) syncBoard(); return; }

  if(a==="nav"){ const sc=t.dataset.screen; if(sc==="exam-builder") App.builder=null; App.screen=sc; render(); if(sc==="leaderboard") syncBoard(); return; }

  // search → study one question
  if(a==="open-q"){ startPracticeCtx({ids:[t.dataset.qid]}, "Search result"); return; }
  if(a==="search-filter"){ App.search=App.search||{q:"",subject:null,type:null}; App.search[t.dataset.k]=t.dataset.v||null; render(); return; }
  // daily goal stepper
  if(a==="set-goal"){ const d=parseInt(t.dataset.d,10)||0; DB.settings.dailyGoal=Math.max(5,Math.min(200,(DB.settings.dailyGoal||20)+d)); save.settings(); render(); return; }
  // sounds on/off
  if(a==="set-sound"){ DB.settings.sounds=!DB.settings.sounds; save.settings(); if(DB.settings.sounds) cue("correct"); render(); return; }
  if(a==="set-revealonpick"){ DB.settings.revealOnPick=(DB.settings.revealOnPick===false); save.settings(); render(); return; }
  // leaderboard display name
  if(a==="set-name"){ const v=(prompt("Choose a nickname for the leaderboard — please DON'T use your real name. Leave blank for a random one:", "")||"").trim().slice(0,24); DB.settings.displayName = v || randomAlias(); save.settings(); render(); syncBoard(); return; }
  if(a==="lb-view"){ App.lbView=t.dataset.v; render(); return; }
  if(a==="lb-subject"){ App.lbSubject=t.dataset.s||null; render(); return; }

  // issue reporting
  if(a==="report-open"){ openReport(t.dataset.qid); return; }
  if(a==="report-close"||a==="modal-bg"){ closeReport(); return; }
  if(a==="noop"){ return; }
  if(a==="report-type"){ reportType=t.dataset.type; document.querySelectorAll(".rtype").forEach(b=>b.classList.toggle("on", b.dataset.type===reportType)); return; }
  if(a==="report-submit"){
    const note=($("reporttext")?.value||"").trim(); const q=QMAP[App.reportQid];
    const rep={reportId:"rep-"+Date.now(), date:today(), qid:q.id, subject:q.packTitle, topic:q.topic, type:reportType, note};
    DB.reports.push(rep); save.reports(); postReport(rep,q); closeReport(); toast("Report sent — thank you"); return;
  }
  if(a==="export-reports"){ exportJSON(DB.reports,"medrecall-reports-"+today()+".json"); toast("Reports exported"); return; }
  if(a==="clear-reports"){ if(confirm("Clear all collected reports?")){ DB.reports=[]; save.reports(); render(); toast("Reports cleared"); } return; }

  // wallpaper
  if(a==="set-wall"){ DB.settings.wallpaper=t.dataset.id; save.settings(); applyWallpaper(); render(); return; }
  if(a==="set-theme"){ DB.settings.theme=t.dataset.theme; save.settings(); applyTheme(); applyWallpaper(); render(); return; }
  if(a==="celebrate-done"){ App.screen="home"; render(); return; }
  if(a==="wall-upload"){ const f=$("wallfile"); if(f) f.click(); return; }
  if(a==="wall-remove"){ wallImg=null; wsSet("medrecall:wallpaperimg:v1", null); DB.settings.wallpaper="ink"; save.settings(); applyWallpaper(); render(); toast("Custom image removed"); return; }

  // home / browse
  if(a==="start-smart"){ startPracticeCtx({smart:true}, "Smart Review"); return; }
  if(a==="open-system"){ App.nav={system:t.dataset.system, type:null, reference:null}; App.screen="system"; render(); return; }
  // question-bank grid → per-specialty multi-select session picker
  if(a==="open-bank-system"){ App.nav={system:t.dataset.system, type:null, reference:null}; App.bankPick={system:t.dataset.system, refs:new Set()}; App.screen="banksys"; render(); return; }
  if(a==="bank-pick"){ const r=t.dataset.ref, refs=bankPickSet(App.nav.system); if(refs.has(r)) refs.delete(r); else refs.add(r); render(); return; }
  if(a==="bank-start"){ const bp=App.bankPick; if(!bp||!bp.refs.size){ toast("Tick at least one session"); return; }
    const ids=[]; bp.refs.forEach(r=>poolFor({system:bp.system,reference:r}).forEach(id=>ids.push(id)));
    const uniq=[...new Set(ids)]; if(!uniq.length){ toast("No questions in the selected sessions"); return; }
    startPracticeCtx({ids:uniq}, bp.system+" · "+bp.refs.size+" session"+(bp.refs.size>1?"s":"")); return; }
  if(a==="study-saved"){ const pool=Object.keys(DB.progress.questions).filter(id=>DB.progress.questions[id].marked && QMAP[id]); if(!pool.length){ toast("No saved questions"); return; } startPracticeCtx({ids:pool}, "Saved questions"); return; }
  if(a==="view-fixes"){ const ids=((App.fixAlert&&App.fixAlert.ids)||[]).slice(); markFixesSeen(); if(!ids.length){ render(); return; } App.fixReview=ids; App.screen="fixes"; render(); return; }
  if(a==="dismiss-fixes"){ markFixesSeen(); render(); return; }
  if(a==="study-fixes"){ const ids=(App.fixReview||[]).filter(id=>QMAP[id]); if(!ids.length){ toast("Nothing to study"); return; } startPracticeCtx({ids}, "Recently fixed"); return; }
  if(a==="toggle-stage"){ const st=t.dataset.stage; App.collapsedStages[st]=(App.collapsedStages[st]===false); render(); return; }
  if(a==="open-mistakes"){ App.screen="mistakes"; render(); return; }
  if(a==="start-mistakes"){ const pool=mistakePool(); if(!pool.length){ toast("No mistakes yet"); return; } startPracticeCtx({ids:pool}, "Fix my mistakes"); return; }
  if(a==="open-disputed"){ App.screen="disputed"; render(); return; }
  if(a==="start-disputed"){ const pool=disputedIds(); if(!pool.length){ toast("Nothing flagged"); return; } startPracticeCtx({ids:pool}, "Disputed answers"); return; }
  if(a==="open-redflag"){ App.screen="redflag"; render(); return; }
  if(a==="start-redflag"){ const pool=redFlagIds(); if(!pool.length){ toast("No red-flag questions"); return; } startPracticeCtx({ids:pool}, "Red-flag drills"); return; }
  if(a==="open-checklist"){ App.screen="checklist"; render(); return; }
  if(a==="checklist-subject"){ App.checklistSubject=t.dataset.subject; render(); return; }
  if(a==="checklist-toggle"){ DB.progress.checklist=DB.progress.checklist||{}; const k=t.dataset.key; DB.progress.checklist[k]=!DB.progress.checklist[k]; save.progress(); render(); return; }
  if(a==="checklist-drill"){ const sys=t.dataset.sys, it=CHECKLISTS[sys][+t.dataset.idx]; const pool=checklistMatch(sys,it); if(!pool.length){ toast("No matching questions"); return; } startPracticeCtx({ids:pool}, it.t); return; }
  if(a==="open-duelpick"){ App.screen="duelpick"; render(); return; }
  if(a==="start-duel"){ const cat=t.dataset.cat||null; const order=DUELS.map((d,i)=>i).filter(i=>!cat||DUELS[i].sys===cat); for(let i=order.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); const x=order[i];order[i]=order[j];order[j]=x; } if(!order.length){ toast("No duels in this division"); return; } App.duel={order,i:0,score:0,picked:null,revealed:false,cat,flip:Math.random()<0.5}; App.screen="duel"; render(); return; }
  if(a==="duel-pick"){ duelPick(t.dataset.pick); return; }
  if(a==="duel-next"){ App.duel.i++; App.duel.picked=null; App.duel.revealed=false; App.duel.flip=Math.random()<0.5; render(); window.scrollTo({top:0,behavior:"instant"}); return; }
  if(a==="duel-done"){ const sc=App.duel?App.duel.score:0, n=App.duel?App.duel.order.length:0; App.duel=null; App.screen="home"; render(); if(n) toast("Duel complete · "+sc+"/"+n); return; }
  if(a==="start-cram"){ const pool=cramPool(40); if(!pool.length){ toast("Study a little first — then cram"); return; } startPracticeCtx({ids:pool}, "Exam Tomorrow · cram"); return; }
  if(a==="open-timer"){ App.screen="timer"; render(); return; }
  if(a==="trk-day"){ App.trkSel=t.dataset.date; App.trkMonth=t.dataset.date.slice(0,7); render(); return; }
  if(a==="trk-month"){ const d=+t.dataset.delta, b=(App.trkMonth||today().slice(0,7))+"-01", dt=new Date(b+"T00:00:00"); dt.setMonth(dt.getMonth()+d); App.trkMonth=ymd(dt).slice(0,7); render(); return; }
  if(a==="trk-view"){ App.trkView=t.dataset.v; render(); return; }
  if(a==="open-reports-inbox"){ App.screen="reportsinbox"; App.inboxState="loading"; App.inboxRows=[]; render(); fetchReports(); return; }
  if(a==="open-reported-q"){ const qid=t.dataset.qid; if(!qid){ toast("This report has no question id"); return; } qeInit(qid); App.screen="qedit"; render(); window.scrollTo({top:0,behavior:"instant"}); return; }
  if(a==="qedit-correct"){ qeSyncDraft(); const i=+t.dataset.i, d=App.qedit.draft; d.choices.forEach((c,k)=>c.correct=(k===i)); render(); return; }
  if(a==="qedit-delchoice"){ qeSyncDraft(); const d=App.qedit.draft; d.choices.splice(+t.dataset.i,1); reLetter(d.choices); render(); return; }
  if(a==="qedit-addchoice"){ qeSyncDraft(); const d=App.qedit.draft; d.choices.push({l:String.fromCharCode(65+d.choices.length), t:"", correct:false, e:""}); render(); return; }
  if(a==="qedit-save"){ qeSyncDraft(); const d=App.qedit.draft, nc=d.choices.filter(c=>c.correct).length; if(d.choices.length && nc!==1){ toast("Mark exactly one correct answer"); return; } const patch=qeBuildPatch(); DB.settings.qedits=DB.settings.qedits||{}; DB.settings.qedits[App.qedit.qid]=patch; save.settings(); buildIndex(); postEdit(App.qedit.qid, patch); { const _s=Array.isArray(DB.settings.fixSeen)?DB.settings.fixSeen:[]; if(!_s.includes(App.qedit.qid)){ _s.push(App.qedit.qid); DB.settings.fixSeen=_s; save.settings(); } } qeInit(App.qedit.qid); render(); toast(DB.settings.groupEndpoint?"Fix saved & announced to everyone ✓":"Fix saved on this device"); return; }
  if(a==="qedit-copy"){ qeSyncDraft(); const d=App.qedit.draft, q=QMAP[App.qedit.qid]; reLetter(d.choices); const src={ id:App.qedit.qid, type:q.type, system:q.system, reference:q.reference, topic:q.topic, stem:d.stem, choices:d.choices.map(c=>({label:c.l,text:c.t,correct:!!c.correct,explanation:c.e||undefined})), keyPoint:d.keyPoint||undefined, flag:d.flagSev?{severity:d.flagSev,note:d.flagNote,source:"maintainer edit"}:undefined }; copyText(JSON.stringify(src,null,2), "Corrected JSON copied", src, App.qedit.qid+".json"); return; }
  if(a==="qedit-revert"){ if(DB.settings.qedits) delete DB.settings.qedits[App.qedit.qid]; save.settings(); buildIndex(); qeInit(App.qedit.qid); render(); toast("Your edit was reverted"); return; }
  if(a==="notif-reports"){ DB.settings.notifyReports=(DB.settings.notifyReports===false); save.settings(); if(DB.settings.notifyReports){ (async()=>{ if(notifSupported()&&notifPermission()==="default"){ try{ await Notification.requestPermission(); }catch(e){} } checkNewReports(); })(); } render(); return; }
  if(a==="refresh-reports-inbox"){ fetchReports(); return; }
  if(a==="start-timer"){ startTimer(); render(); return; }
  if(a==="stop-timer"){ stopTimer(); render(); const s=studyToday(); toast("Saved · "+fmtHM(s)+" today"); return; }
  if(a==="timer-subject"){ const cur=DB.progress.timer||{running:false,startedAt:null}; DB.progress.timer={...cur, subject:t.dataset.s}; save.progress(); render(); return; }
  if(a==="timer-toggle"){ const sub=t.dataset.s, cur=DB.progress.timer||{}; if(cur.running && cur.subject===sub){ stopTimer(); } else { if(cur.running) stopTimer(); DB.progress.timer={running:true,startedAt:Date.now(),subject:sub}; save.progress(); } if(DB.settings.groupEndpoint||DB.settings.lbRepo) syncBoard(); render(); return; }
  if(a==="set-examdate"){ const v=($("examdate")?.value||"").trim(); DB.settings.examDate=v; save.settings(); render(); toast(v?"Exam date set":"Exam date cleared"); return; }
  if(a==="notif-enable"){ const N=notifCfg(); if(N.enabled && notifPermission()==="granted"){ disableNotifs(); } else { enableNotifs(); } return; }
  if(a==="notif-toggle"){ const N=notifCfg(); N[t.dataset.k]=(N[t.dataset.k]===false); save.settings(); scheduleReminders(); render(); return; }
  if(a==="notif-time"){ const v=(($("notiftime")||{}).value||"").trim(); if(v){ notifCfg().time=v; save.settings(); scheduleReminders(); render(); toast("Reminder time set to "+v); } return; }
  if(a==="notif-prompt-enable"){ notifCfg().prompted=true; save.settings(); enableNotifs(); return; }
  if(a==="notif-prompt-dismiss"){ notifCfg().prompted=true; save.settings(); render(); toast("You can turn reminders on any time in Settings"); return; }
  if(a==="notif-test"){ (async function(){ if(notifPermission()!=="granted"){ toast("Enable reminders first"); return; } try{ const reg=await navigator.serviceWorker.ready; await reg.showNotification("MedCall", {body:"This is a test reminder — you're all set.", tag:"medcall-test", data:{url:"./"}}); toast("Test sent"); }catch(e){ toast("Could not send test"); } })(); return; }
  if(a==="study-one"){ const id=t.dataset.id; startPracticeCtx({ids:[id]}, (QMAP[id]||{}).topic||"Question"); return; }
  if(a==="open-type"){ App.nav={system:t.dataset.system, type:t.dataset.type, reference:null}; App.screen="type"; render(); return; }
  if(a==="open-reference"){ App.nav={system:t.dataset.system, type:t.dataset.type, reference:t.dataset.reference}; App.screen="reference"; render(); return; }
  if(a==="study-system"){ startPracticeCtx({system:t.dataset.system}, t.dataset.system); return; }
  if(a==="study-type"){ startPracticeCtx({system:t.dataset.system, type:t.dataset.type}, t.dataset.type); return; }
  if(a==="study-reference"){ startPracticeCtx({system:t.dataset.system, type:t.dataset.type, reference:t.dataset.reference}, t.dataset.reference); return; }
  if(a==="study-topic"){ startPracticeCtx({system:t.dataset.system, type:t.dataset.type, reference:t.dataset.reference, topic:t.dataset.topic}, t.dataset.topic); return; }
  if(a==="open-theme"){ App.theme={sys:t.dataset.system, ty:t.dataset.type, reference:t.dataset.reference, topic:t.dataset.topic, revealed:{}, picks:{}, optsCollapsed:false}; App.screen="theme"; render(); return; }
  if(a==="theme-toggle-opts"){ App.theme.optsCollapsed=!App.theme.optsCollapsed; const box=$("themeOptsBox"); if(box){ const col=App.theme.optsCollapsed, chev=t.querySelector&&t.querySelector(".chev"); box.style.maxHeight=box.scrollHeight+"px"; if(col){ requestAnimationFrame(function(){ box.style.maxHeight="0"; }); } if(chev) chev.style.transform=col?"rotate(-90deg)":"rotate(0deg)"; } else { render(); } return; }
  if(a==="theme-pick"){ const i=t.dataset.i; if(App.theme.revealed[i]) return; App.theme.picks[i]=t.dataset.label; render(); return; }
  if(a==="theme-continue"){ const s=App.practice; if(!s){ App.screen="home"; render(); return; }
    const ids=poolFor({system:App.theme.sys,type:App.theme.ty,reference:App.theme.reference,topic:App.theme.topic});
    s.consumed=s.consumed||{}; ids.forEach(function(x){ s.consumed[x]=1; });
    let k=s.i+1; while(k<s.pool.length && s.consumed[s.pool[k]]) k++;
    if(k>=s.pool.length){ clearSession(s.ctx); DB.progress.resume=null; save.progress(); App.lastSession={answered:s.answered,correct:s.correct,xp:s.xp,label:s.label}; evaluateAchievements({perfectSet: s.answered>=10 && s.correct===s.answered}); App.practice=null; App.screen="celebrate"; render(); confetti(); cue("done"); return; }
    s.i=k; saveSession(s); practiceRoute(); return; }
  if(a==="theme-reveal"){ const i=t.dataset.i; if(App.theme.revealed[i]) return; const ids=poolFor({system:App.theme.sys,type:App.theme.ty,reference:App.theme.reference,topic:App.theme.topic}); const q=QMAP[ids[+i]]; const pick=App.theme.picks[i]; App.theme.revealed[i]=true; if(q&&pick){ const ok=correctLabel(q)===pick; recordAttempt(q,pick,ok?"good":"again"); cue(ok?"correct":"wrong"); if(App.theme.fromPractice&&App.practice){ App.practice.answered++; if(ok)App.practice.correct++; App.practice.xp+=awardXP(ok?10:4); evaluateAchievements(); } } render(); return; }
  if(a==="resume"){ const r=DB.progress.resume; if(r&&r.ctx) startPracticeCtx(r.ctx, r.label, r.i); return; }
  if(a==="resume-session"){ const x=(DB.progress.sessions||{})[t.dataset.key]; if(x&&x.ctx) startPracticeCtx(x.ctx, x.label, x.i); return; }
  if(a==="drop-session"){ if(DB.progress.sessions) delete DB.progress.sessions[t.dataset.key]; save.progress(); render(); toast("Session removed"); return; }
  if(a==="nav-q"){ const s=App.practice; if(!s) return; const ni=s.i+(+t.dataset.dir); if(ni<0||ni>=s.pool.length) return; s.i=ni; s.revealed=false; s.selected=null; s.saText=""; s.optsCollapsed=false; s.confidence=null; saveSession(s); practiceRoute(); return; }

  // quiz
  if(a==="select-choice"){ const s=App.practice; s.selected=t.dataset.label; const q=QMAP[s.pool[s.i]]; if(DB.settings.revealOnPick!==false && q.type!=="sa") s.revealed=true; render(); return; }
  if(a==="toggle-emq-opts"){ App.practice.optsCollapsed=!App.practice.optsCollapsed; render(); return; }
  if(a==="reveal"){ const s=App.practice,q=QMAP[s.pool[s.i]]; if(q.type==="sa"){ const ta=$("saInput"); s.saText=ta?ta.value:""; } s.revealed=true; render(); return; }
  if(a==="grade"){ gradeCurrent(t.dataset.grade); return; }
  if(a==="confidence"){ if(App.practice){ App.practice.confidence=t.dataset.c; render(); } return; }
  if(a==="toggle-mark"){ const s=App.practice,q=QMAP[s.pool[s.i]];
    const p=DB.progress.questions[q.id]||{seen:0,correct:0,history:[],marked:false,srs:null};
    p.marked=!p.marked; DB.progress.questions[q.id]=p; save.progress(); render();
    toast(p.marked?"Marked for review":"Unmarked"); return; }
  if(a==="end-practice"){ const s=App.practice; if(s) saveSession(s); App.practice=null; App.screen="home"; render(); scheduleReminders(); return; }

  // builder
  if(a==="exam-toggle-subject"){ const id=t.dataset.subject; App.builder.subjects.has(id)?App.builder.subjects.delete(id):App.builder.subjects.add(id);
    const avail=BANK.filter(p=>App.builder.subjects.has(p.id)).reduce((n,p)=>n+p.questions.length,0);
    if(App.builder.count>avail) App.builder.count=avail; render(); return; }
  if(a==="exam-count"){ App.builder.count=+t.dataset.n; render(); return; }
  if(a==="exam-timer"){ App.builder.timer=t.dataset.mode; render(); return; }
  if(a==="exam-min"){ App.builder.minutes=+t.dataset.m; render(); return; }
  if(a==="exam-shuffle"){ App.builder.shuffle=!App.builder.shuffle; render(); return; }
  if(a==="exam-pass"){ App.builder.pass=Math.max(0,Math.min(100,App.builder.pass+ +t.dataset.d)); DB.settings.passMark=App.builder.pass; save.settings(); render(); return; }
  if(a==="exam-start"){ startExam(); return; }

  // exam runner
  if(a==="exam-select"){ App.exam.answers[App.exam.ids[App.exam.i]]=t.dataset.label; render(); return; }
  if(a==="exam-flag"){ const id=App.exam.ids[App.exam.i]; App.exam.flags.has(id)?App.exam.flags.delete(id):App.exam.flags.add(id); render(); return; }
  if(a==="exam-jump"){ App.exam.i=+t.dataset.i; render(); window.scrollTo({top:0,behavior:"instant"}); return; }
  if(a==="exam-prev"){ if(App.exam.i>0)App.exam.i--; render(); window.scrollTo({top:0,behavior:"instant"}); return; }
  if(a==="exam-next"){ if(App.exam.i<App.exam.ids.length-1)App.exam.i++; render(); window.scrollTo({top:0,behavior:"instant"}); return; }
  if(a==="exam-submit"){ submitExam(false); return; }
  if(a==="exam-quit"){ if(App.exam.timerId)clearInterval(App.exam.timerId); App.exam=null; App.screen="home"; render(); return; }

  // results
  if(a==="exam-review"){ App.examReview=true; render(); return; }
  if(a==="exam-results-back"){ App.examReview=false; render(); return; }
  if(a==="exam-push-srs"){
    let n=0; App.examResult.answers.filter(x=>!x.ok).forEach(x=>{
      const q=QMAP[x.qid], p=DB.progress.questions[q.id]||{seen:0,correct:0,history:[],marked:false,srs:null};
      p.srs=schedule(p.srs,"again"); p.marked=true; DB.progress.questions[q.id]=p; n++;
    });
    save.progress(); toast(n+" added to review"); t.setAttribute("disabled",""); return; }

  // settings
  if(a==="set-newperday"){ DB.settings.newPerDay=Math.max(5,DB.settings.newPerDay+ +t.dataset.d); save.settings(); render(); return; }
  if(a==="set-pass"){ DB.settings.passMark=Math.max(0,Math.min(100,DB.settings.passMark+ +t.dataset.d)); save.settings(); render(); return; }
  if(a==="repair-export"){ const r=scanBank(); exportJSON({generated:today(), packs:r.packs, total:r.total, errors:r.errs, warnings:r.warns}, "medcall-bank-health-"+today()+".json"); toast("Health report downloaded"); return; }
  if(a==="export"){ exportProgress(); return; }
  if(a==="export-anki-all"){ exportAnki(Object.keys(QMAP),"medcall-all"); return; }
  if(a==="export-anki-mistakes"){ exportAnki(mistakeIds(),"medcall-mistakes"); return; }
  if(a==="export-anki-system"){ exportAnki(poolFor({system:t.dataset.system}), ghSlug(t.dataset.system)); return; }
  if(a==="import-toggle"){ const b=$("importbox"); b.style.display=b.style.display==="none"?"block":"none"; return; }
  if(a==="import-apply"){ importProgress($("importtext").value); return; }
  if(a==="reset"){ if(confirm("Erase all saved progress? This cannot be undone.")){ DB.progress={questions:{},resume:null,streak:{current:0,lastStudied:null}}; DB.exams=[]; save.progress(); save.exams(); App.screen="home"; render(); toast("Progress reset"); } return; }
});

document.addEventListener("keydown", e=>{
  const tn=(e.target&&e.target.tagName)||""; if(/^(INPUT|TEXTAREA|SELECT)$/.test(tn)) return;
  if(e.metaKey||e.ctrlKey||e.altKey) return;
  const k=e.key;
  if(App.screen==="quiz" && App.practice){
    const s=App.practice, q=QMAP[s.pool[s.i]]; if(!q) return;
    if(!s.revealed){
      const up=(k||"").toUpperCase();
      if(q.type!=="sa" && /^[A-H]$/.test(up) && q.choices.some(c=>c.l===up)){ s.selected=up; render(); e.preventDefault(); return; }
      if((k===" "||k==="Enter") && (q.type==="sa"||s.selected)){ if(q.type==="sa"){ const ta=$("saInput"); s.saText=ta?ta.value:""; } s.revealed=true; render(); e.preventDefault(); return; }
    } else {
      const g={"1":"again","2":"hard","3":"good","4":"easy"}[k];
      if(g){ gradeCurrent(g); e.preventDefault(); return; }
      if(k===" "||k==="Enter"){ gradeCurrent("good"); e.preventDefault(); return; }
    }
    return;
  }
  if(App.screen==="duel" && App.duel){
    if(!App.duel.revealed){ if(k==="a"||k==="A"||k==="1"){ duelPick(App.duel.flip?"b":"a"); e.preventDefault(); } else if(k==="b"||k==="B"||k==="2"){ duelPick(App.duel.flip?"a":"b"); e.preventDefault(); } }
    else if(k===" "||k==="Enter"){ if(App.duel.i+1>=App.duel.order.length){ App.duel=null; App.screen="home"; render(); } else { App.duel.i++; App.duel.picked=null; App.duel.revealed=false; App.duel.flip=Math.random()<0.5; render(); } e.preventDefault(); }
  }
});
function ankiField(s){ return String(s==null?"":s).replace(/\t/g," ").replace(/\r?\n/g,"<br>"); }
function exportAnki(ids,name){
  const rows=["#separator:tab","#html:true","#notetype:Basic","#deck:MedCall"]; let n=0;
  ids.forEach(id=>{ const q=QMAP[id]; if(!q) return;
    let front=(q.optionsTitle?("<b>"+ankiField(q.optionsTitle)+"</b><br>"):"")+ankiField(q.stem);
    if(q.type!=="sa" && q.choices && q.choices.length>1) front+="<br><br>"+q.choices.map(c=>c.l+". "+ankiField(c.t)).join("<br>");
    const cc=(q.choices||[]).find(c=>c.correct); let back="";
    if(q.type==="sa") back="<b>Model answer:</b><br>"+ankiField(q.modelAnswer);
    else if(cc){ back="<b>Correct: "+cc.l+". "+ankiField(cc.t)+"</b>"; if(cc.e) back+="<br><br>"+ankiField(cc.e); }
    const wn=(q.choices||[]).filter(c=>!c.correct && c.e).slice(0,3);
    if(wn.length) back+="<br><br><i>Why not:</i><br>"+wn.map(c=>"• "+c.l+". "+ankiField(c.t)+" — "+ankiField(c.e)).join("<br>");
    if(q.keyPoint) back+="<br><br><i>Key point:</i> "+ankiField(q.keyPoint);
    if(q.flag && q.flag.note) back+="<br><br>⚠ "+ankiField(q.flag.note);
    rows.push(front+"\t"+back); n++;
  });
  if(!n){ toast("Nothing to export"); return; }
  const blob=new Blob([rows.join("\n")],{type:"text/plain;charset=utf-8"});
  const u=URL.createObjectURL(blob), a=document.createElement("a"); a.href=u; a.download=(name||"medcall")+"-anki.txt"; a.click(); URL.revokeObjectURL(u);
  toast(n+" cards exported · import the .txt in Anki");
}
export function exportProgress(){
  const data=JSON.stringify({progress:DB.progress,exams:DB.exams,settings:DB.settings},null,2);
  const blob=new Blob([data],{type:"application/json"});
  const url=URL.createObjectURL(blob), a=document.createElement("a");
  a.href=url; a.download="medrecall-progress-"+today()+".json"; a.click(); URL.revokeObjectURL(url);
  toast("Backup downloaded");
}
export function importProgress(txt){
  try{
    const d=JSON.parse(txt);
    if(d.progress && typeof d.progress==="object"){
      const defaults={questions:{},resume:null,streak:{current:0,lastStudied:null}};
      DB.progress=Object.assign(defaults, d.progress);
    }
    if(d.exams) DB.exams=d.exams;
    if(d.settings) DB.settings=Object.assign(DB.settings,d.settings);
    save.progress(); save.exams(); save.settings();
    App.screen="home"; render(); toast("Progress imported ✓");
  }catch(err){ toast("Invalid JSON"); }
}

/* ============================================================
   BOOT
   ============================================================ */
/* ============================================================
   THEME + WALLPAPER
   ============================================================ */
function applyTheme(){
  document.documentElement.setAttribute("data-theme", DB.settings.theme==="light"?"light":"dark");
}
const WALLPAPERS = {
  ink:      {name:"Clinic",    dark:"radial-gradient(900px 520px at 82% -12%, rgba(244,104,79,.10), transparent 60%), radial-gradient(760px 420px at -12% 0%, rgba(150,110,70,.16), transparent 55%), #1a1714", light:"radial-gradient(900px 520px at 82% -12%, rgba(244,104,79,.08), transparent 60%), radial-gradient(760px 420px at -12% 0%, rgba(210,180,150,.20), transparent 55%), #faf6f1"},
  midnight: {name:"Espresso",  dark:"linear-gradient(160deg,#201a15,#14110e)", light:"linear-gradient(160deg,#f3ece2,#faf6f1)"},
  teal:     {name:"Sage",      dark:"linear-gradient(160deg,#16211c,#161310)", light:"linear-gradient(160deg,#e6efe4,#faf6f1)"},
  charcoal: {name:"Warm Coal", dark:"#191512", light:"#eee7dd"},
  plum:     {name:"Mulberry",  dark:"linear-gradient(160deg,#211621,#161210)", light:"linear-gradient(160deg,#f2e8ee,#faf6f1)"},
  aurora:   {name:"Sunset",    dark:"radial-gradient(700px 380px at 90% -5%, rgba(244,104,79,.16), transparent), radial-gradient(700px 380px at -5% 10%, rgba(240,166,62,.14), transparent), #171310", light:"radial-gradient(700px 380px at 90% -5%, rgba(244,104,79,.16), transparent), radial-gradient(700px 380px at -5% 10%, rgba(240,166,62,.18), transparent), #f9f4ee"}
};
function wallTheme(){ return DB.settings.theme==="light"?"light":"dark"; }
let wallImg=null;
function applyWallpaper(){
  const th=wallTheme(), w=DB.settings.wallpaper||"ink";
  let css;
  if(w==="custom" && wallImg){
    const ov = th==="light" ? "rgba(238,241,246,.80),rgba(238,241,246,.88)" : "rgba(13,19,24,.74),rgba(13,19,24,.84)";
    css=`linear-gradient(${ov}), url('${wallImg}') center/cover no-repeat`;
  } else { const wp=WALLPAPERS[w]||WALLPAPERS.ink; css=wp[th]; }
  document.body.style.background=css;
  document.body.style.backgroundAttachment="fixed";
}
function handleWallpaperFile(file){
  if(!file) return;
  const reader=new FileReader();
  reader.onload=()=>{
    const img=new Image();
    img.onload=()=>{
      const max=1280; let w=img.width, h=img.height; const sc=Math.min(1,max/Math.max(w,h));
      w=Math.round(w*sc); h=Math.round(h*sc);
      const cv=document.createElement("canvas"); cv.width=w; cv.height=h;
      cv.getContext("2d").drawImage(img,0,0,w,h);
      let data; try{ data=cv.toDataURL("image/jpeg",0.72); }catch(e){ toast("Couldn't process image"); return; }
      wallImg=data; wsSet("medrecall:wallpaperimg:v1", data);
      DB.settings.wallpaper="custom"; save.settings(); applyWallpaper(); render(); toast("Wallpaper set");
    };
    img.onerror=()=>toast("Couldn't load image");
    img.src=reader.result;
  };
  reader.readAsDataURL(file);
}
document.body.addEventListener("change", e=>{ if(e.target && e.target.id==="wallfile") handleWallpaperFile(e.target.files[0]); });

/* ============================================================
   XP · LEVELS · CELEBRATION
   ============================================================ */
export const levelOf  = xp => Math.floor((xp||0)/200)+1;
export const xpInLevel= xp => (xp||0)%200;
export function awardXP(amount){
  const old=DB.progress.xp||0, oldLvl=levelOf(old);
  DB.progress.xp = old+amount;
  DB.progress.xpLog = DB.progress.xpLog || {};
  const t=today(); DB.progress.xpLog[t] = (DB.progress.xpLog[t]||0) + amount;
  save.progress();
  if(levelOf(DB.progress.xp)>oldLvl){ confetti(); cue("level"); toast("Level up! You reached Level "+levelOf(DB.progress.xp)); }
  return amount;
}
function confetti(){
  const c=document.createElement("canvas"); c.className="confetti"; document.body.appendChild(c);
  const ctx=c.getContext("2d"); const W=c.width=innerWidth, H=c.height=innerHeight;
  const cols=["#3fb6a8","#5ec48f","#d9a441","#7e9fd1","#e07a83"];
  const P=[]; for(let i=0;i<130;i++) P.push({x:Math.random()*W,y:-20-Math.random()*H*0.3,vx:(Math.random()-0.5)*3.2,vy:2+Math.random()*4,s:4+Math.random()*7,c:cols[i%cols.length],a:Math.random()*6.28,va:(Math.random()-0.5)*0.34});
  const t0=performance.now();
  (function frame(t){ ctx.clearRect(0,0,W,H);
    P.forEach(p=>{ p.x+=p.vx; p.y+=p.vy; p.vy+=0.045; p.a+=p.va; ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.a); ctx.fillStyle=p.c; ctx.fillRect(-p.s/2,-p.s/2,p.s,p.s*0.62); ctx.restore(); });
    if(t-t0<2300) requestAnimationFrame(frame); else c.remove();
  })(t0);
}

/* ============================================================
   SOUND CUES (synthesized, optional, off by default)
   ============================================================ */
let _ac=null;
function audioCtx(){ try{ _ac=_ac||new (window.AudioContext||window.webkitAudioContext)(); if(_ac.state==="suspended")_ac.resume(); return _ac; }catch(e){ return null; } }
function beep(freq, t0, dur, type, gain){
  const ac=audioCtx(); if(!ac) return;
  const o=ac.createOscillator(), g=ac.createGain();
  o.type=type||"sine"; o.frequency.value=freq;
  const start=ac.currentTime+t0;
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(gain||0.16, start+0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, start+dur);
  o.connect(g); g.connect(ac.destination); o.start(start); o.stop(start+dur+0.02);
}
function cue(name){
  if(!DB.settings.sounds) return;
  if(name==="correct"){ beep(660,0,0.12,"sine",0.16); beep(880,0.09,0.16,"sine",0.15); }
  else if(name==="wrong"){ beep(200,0,0.18,"sine",0.14); }
  else if(name==="level"){ [523,659,784,1047].forEach((f,i)=>beep(f,i*0.09,0.22,"triangle",0.15)); }
  else if(name==="achieve"){ [784,988,1319].forEach((f,i)=>beep(f,i*0.07,0.2,"sine",0.15)); }
  else if(name==="daily"){ [659,880].forEach((f,i)=>beep(f,i*0.1,0.25,"triangle",0.15)); }
  else if(name==="done"){ [523,784].forEach((f,i)=>beep(f,i*0.08,0.2,"sine",0.14)); }
}

/* ============================================================
   ACHIEVEMENTS
   ============================================================ */
export const ACHIEVEMENTS = [
  {id:"first",    icon:"&#127793;", name:"First Steps",   desc:"Answer your first question",           test:s=>s.answered>=1},
  {id:"fifty",    icon:"&#128293;", name:"Warming Up",     desc:"Answer 50 questions",                  test:s=>s.answered>=50},
  {id:"century",  icon:"&#128175;", name:"Century",        desc:"Answer 100 questions",                 test:s=>s.answered>=100},
  {id:"halfk",    icon:"&#128640;", name:"Marathoner",     desc:"Answer 500 questions",                 test:s=>s.answered>=500},
  {id:"streak3",  icon:"&#128197;", name:"Three in a Row", desc:"Hit a 3-day study streak",             test:s=>s.streak>=3},
  {id:"streak7",  icon:"&#128467;", name:"Week Warrior",   desc:"Hit a 7-day study streak",             test:s=>s.streak>=7},
  {id:"streak30", icon:"&#127942;", name:"Unstoppable",    desc:"Hit a 30-day study streak",            test:s=>s.streak>=30},
  {id:"perfect",  icon:"&#127919;", name:"Flawless",       desc:"A perfect set of 10 or more",          test:s=>s.perfectSet},
  {id:"master10", icon:"&#129504;", name:"Sticking",       desc:"Master 10 questions (21-day interval)",test:s=>s.mastered>=10},
  {id:"master50", icon:"&#127793;", name:"Deep Roots",     desc:"Master 50 questions",                  test:s=>s.mastered>=50},
  {id:"exam80",   icon:"&#129658;", name:"Exam Ready",     desc:"Score 80%+ on an Exam Simulation",     test:s=>s.bestExam>=80},
  {id:"level5",   icon:"&#11088;",  name:"Rising",         desc:"Reach Level 5",                        test:s=>s.level>=5},
  {id:"level10",  icon:"&#127775;", name:"Seasoned",       desc:"Reach Level 10",                       test:s=>s.level>=10},
];
export function achStats(extra){
  let answered=0, mastered=0;
  Object.values(DB.progress.questions).forEach(p=>{ answered+=p.seen||0; if(p.srs&&p.srs.interval>=21)mastered++; });
  const bestExam=(DB.exams||[]).reduce((m,e)=>Math.max(m,e.percent||0),0);
  return Object.assign({ answered, mastered, bestExam,
    streak:DB.progress.streak?.current||0, level:levelOf(DB.progress.xp), perfectSet:false }, extra||{});
}
export function evaluateAchievements(extra){
  const s=achStats(extra);
  DB.progress.achievements = DB.progress.achievements || {};
  const newly=[];
  ACHIEVEMENTS.forEach(a=>{ if(!DB.progress.achievements[a.id] && a.test(s)){ DB.progress.achievements[a.id]=today(); newly.push(a); } });
  if(newly.length){ save.progress(); confetti(); newly.forEach((a,i)=>setTimeout(()=>{ toast("Achievement unlocked — "+a.name); cue("achieve"); }, i*900)); }
  return newly;
}
export function weakestTopic(){
  const g=new Map();
  allQs().forEach(q=>{ const pr=DB.progress.questions[q.id]; if(!pr||!pr.seen) return;
    const k=qSys(q)+"|"+qRef(q)+"|"+(q.topic||"General");
    const o=g.get(k)||{seen:0,correct:0,system:qSys(q),reference:qRef(q),topic:q.topic||"General"};
    o.seen+=pr.seen; o.correct+=pr.correct; g.set(k,o);
  });
  let best=null; g.forEach(o=>{ if(o.seen>=3){ const acc=o.correct/o.seen; if(!best||acc<best.acc) best={...o,acc}; } });
  return best;
}
export function freshTopic(){
  const g=new Map();
  allQs().forEach(q=>{ const k=qSys(q)+"|"+qRef(q)+"|"+(q.topic||"General");
    const o=g.get(k)||{count:0,seenAny:false,system:qSys(q),reference:qRef(q),topic:q.topic||"General"};
    o.count++; if(DB.progress.questions[q.id]) o.seenAny=true; g.set(k,o);
  });
  let best=null; g.forEach(o=>{ if(!o.seenAny){ if(!best||o.count>best.count) best=o; } });
  return best;
}
export function computeSuggestions(){
  const out=[];
  const due=dueCount();
  if(due>0) out.push({icon:"&#8635;", title:"Review "+due+" due now", sub:"Lock it in with spaced repetition", action:"start-smart"});
  const w=weakestTopic();
  if(w) out.push({icon:"&#9678;", title:"Shore up: "+w.topic, sub:Math.round(w.acc*100)+"% so far · "+w.system, action:"topic", data:w});
  const n=freshTopic();
  if(n && out.length<3) out.push({icon:"&#10022;", title:"Try something new: "+n.topic, sub:n.system+" · "+n.count+" fresh", action:"topic", data:n});
  if(!out.length) out.push({icon:"&#10022;", title:"Start studying", sub:"Pick a system below", action:"none"});
  return out.slice(0,3);
}

/* ============================================================
   STUDY REMINDERS  (local notifications; design doc §12)
   Uses the Notification Triggers API (TimestampTrigger) so reminders
   fire even when the app is CLOSED on Chromium/Android. Browsers without
   triggers (iOS Safari, Firefox) fall back to an in-app catch-up nudge.
   ============================================================ */
function notifDefaults(){ return { enabled:false, daily:true, due:true, streak:true, exam:true, time:"19:00", lastFired:{} }; }
function notifCfg(){ DB.settings.notif = Object.assign(notifDefaults(), DB.settings.notif||{}); return DB.settings.notif; }
function notifSupported(){ return (typeof Notification!=="undefined") && ("serviceWorker" in navigator) && (location.protocol==="https:"||location.protocol==="http:"); }
function notifPermission(){ return (typeof Notification!=="undefined") ? Notification.permission : "unsupported"; }
function triggersSupported(){ return (typeof window!=="undefined") && ("TimestampTrigger" in window); }
function examDaysFrom(when){ const ex=DB.settings.examDate; if(!ex) return null; const e=new Date(ex+"T00:00:00"); const d0=new Date(when); d0.setHours(0,0,0,0); return Math.round((e-d0)/86400000); }
function notifHour(){ const tp=(notifCfg().time||"19:00").split(":"); return [Math.min(23,Math.max(0,parseInt(tp[0],10)||19)), Math.min(59,Math.max(0,parseInt(tp[1],10)||0))]; }

async function enableNotifs(){
  const N=notifCfg();
  if(!notifSupported()){ toast("Reminders need the online app (open it from the web link, not a downloaded file)"); return; }
  let perm=Notification.permission;
  if(perm==="default"){ try{ perm=await Notification.requestPermission(); }catch(e){ perm=Notification.permission; } }
  if(perm!=="granted"){ N.enabled=false; save.settings(); render(); toast(perm==="denied"?"Notifications are blocked in your browser settings":"Notifications not allowed"); return; }
  N.enabled=true; save.settings();
  await scheduleReminders();
  render();
  toast(triggersSupported()?("Reminders on — you'll be nudged at "+N.time):"Reminders on (this browser nudges only while the app is open)");
}
async function disableNotifs(){ const N=notifCfg(); N.enabled=false; save.settings(); await cancelScheduledReminders(); render(); toast("Reminders off"); }

async function cancelScheduledReminders(){
  try{ const reg=await navigator.serviceWorker.ready; const ns=await reg.getNotifications({includeTriggered:false}); ns.forEach(n=>{ if((n.tag||"").indexOf("medcall-")===0) n.close(); }); }catch(e){}
}

// (Re)arm scheduled reminders that fire even when the app is closed (Chromium/Android).
async function scheduleReminders(){
  const N=notifCfg();
  if(!notifSupported() || !N.enabled || notifPermission()!=="granted") return;
  if(!triggersSupported()) return;              // no scheduled-while-closed here; inAppNotifyCheck() covers it
  let reg; try{ reg=await navigator.serviceWorker.ready; }catch(e){ return; }
  try{ const ex=await reg.getNotifications({includeTriggered:false}); ex.forEach(n=>{ if((n.tag||"").indexOf("medcall-")===0) n.close(); }); }catch(e){}
  const now=Date.now(), hm=notifHour(), hh=hm[0], mm=hm[1];
  // Daily nudge (folds in due + exam), next 7 days
  for(let d=0; d<7; d++){
    if(N.daily===false && N.due===false && N.exam===false) break;
    const when=new Date(); when.setDate(when.getDate()+d); when.setHours(hh,mm,0,0);
    if(when.getTime()<=now+60000) continue;
    const parts=[];
    if(N.daily!==false) parts.push("Time to study");
    if(N.exam!==false){ const dd=examDaysFrom(when); if(dd!==null && dd>=0 && dd<=21) parts.push(dd===0?"exam is TODAY":("D-"+dd+" to your exam")); }
    let body=parts.join(" · ");
    if(N.due!==false){ body = body ? (body+" — review your due cards") : "Your spaced-repetition cards are due for review"; }
    if(!body) continue;
    try{ await reg.showNotification("MedCall", { body, tag:"medcall-daily-"+d, showTrigger:new TimestampTrigger(when.getTime()), data:{url:"./"} }); }catch(e){}
  }
  // Streak saver: today + tomorrow, evening, only if not yet studied that day
  if(N.streak!==false){
    for(let d=0; d<2; d++){
      if(d===0 && (studyToday()>0 || dailyCount()>0)) continue;   // already studied today
      const when=new Date(); when.setDate(when.getDate()+d); when.setHours(Math.max(hh,20),0,0,0);
      if(when.getTime()<=now+60000) continue;
      const sd=studyStreakDays();
      try{ await reg.showNotification("MedCall", { body: sd>0 ? ("Don't break your "+sd+"-day streak — a few cards keeps it alive.") : "A few cards today keeps your streak going.", tag:"medcall-streak-"+d, showTrigger:new TimestampTrigger(when.getTime()), data:{url:"./"} }); }catch(e){}
    }
  }
}

// Fallback for browsers without triggers (iOS Safari, Firefox): nudge when the app opens.
async function inAppNotifyCheck(){
  const N=notifCfg();
  if(!notifSupported() || !N.enabled || notifPermission()!=="granted") return;
  if(triggersSupported()) return;               // scheduled path already covers these browsers
  const hm=notifHour(), mark=new Date(); mark.setHours(hm[0],hm[1],0,0);
  if(new Date()<mark) return;                    // not yet reminder time today
  const t=today();
  if(N.lastFired && N.lastFired.day===t) return; // already nudged today
  const due=dueCount(), studied=(studyToday()>0||dailyCount()>0);
  let body=null;
  if(N.due!==false && due>0) body=due+" card"+(due===1?"":"s")+" due for review";
  else if(N.daily!==false && !studied) body="Time for today's study";
  else if(N.streak!==false && !studied && studyStreakDays()>0) body="Keep your "+studyStreakDays()+"-day streak alive";
  if(N.exam!==false){ const dd=dDay(); if(dd!==null && dd>=0 && dd<=21) body=(body?body+" · ":"")+(dd===0?"exam is TODAY":"D-"+dd+" to exam"); }
  if(!body) return;
  try{ const reg=await navigator.serviceWorker.ready; await reg.showNotification("MedCall", { body, tag:"medcall-catchup", data:{url:"./"} }); N.lastFired={day:t}; save.settings(); }catch(e){}
}

/* ============================================================
   MAINTAINER · LIVE EDITS + REPORT ALERTS + QUESTION EDITOR
   Edits made in-app are saved locally AND posted to the group Script;
   every device fetches ?edits=1 on open and applies them over the
   GitHub-synced bank, so a maintainer fix auto-reaches everyone.
   ============================================================ */
let REMOTE_EDITS = {};   // qid -> patch, pulled from the group Script

function reLetter(choices){ choices.forEach((c,i)=>{ c.l=String.fromCharCode(65+i); }); return choices; }
function copyText(txt, okMsg, obj, fname){
  try{
    if(navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(txt).then(()=>toast(okMsg||"Copied")).catch(()=>{ if(obj)exportJSON(obj,fname); else toast("Copy failed"); }); return; }
  }catch(e){}
  if(obj) exportJSON(obj,fname); else toast("Copy not supported");
}

function patchQuestion(q, patch){
  if(!q || !patch) return;
  if(patch.stem!=null) q.stem=patch.stem;
  if(patch.keyPoint!=null) q.keyPoint=patch.keyPoint;
  if(Array.isArray(patch.choices)) q.choices=patch.choices.map(c=>({l:c.l, t:c.t, correct:!!c.correct, e:c.e}));
  if(patch.flag!==undefined) q.flag = patch.flag ? {severity:patch.flag.severity, note:patch.flag.note, source:patch.flag.source||"maintainer edit"} : undefined;
  q._edited=true;
}
// Apply remote + local field overrides onto the freshly built QMAP (local device wins).
function applyEdits(){
  const merged=Object.assign({}, REMOTE_EDITS||{}, (DB.settings&&DB.settings.qedits)||{});
  for(const qid in merged){ const base=QMAP[qid]; if(!base) continue; const clone=Object.assign({}, base); patchQuestion(clone, merged[qid]); QMAP[qid]=clone; }  // clone -> BANK stays pristine so edits are reversible
}

async function fetchEdits(){
  const ep=DB.settings.groupEndpoint; if(!ep) return;
  try{
    const u=ep+(ep.indexOf("?")>=0?"&":"?")+"edits=1&cb="+Date.now();
    const r=await fetch(u,{cache:"no-store"}); if(!r.ok) return;
    const data=await r.json(); if(!Array.isArray(data)) return;   // script not upgraded yet
    const map={};
    for(const row of data){
      let qid, patch;
      if(Array.isArray(row)){ if(String(row[0]||"").toLowerCase().indexOf("when")>=0) continue; qid=row[1]; try{ patch=JSON.parse(row[2]); }catch(e){ patch=null; } }
      else if(row && typeof row==="object"){ qid=row.qid; patch=(typeof row.patch==="string")? (function(){try{return JSON.parse(row.patch);}catch(e){return null;}})() : row.patch; }
      if(qid && patch) map[qid]=patch;   // later rows win (sheet append order)
    }
    REMOTE_EDITS=map;
    // announce newly-shared fixes to everyone (first sync sets a silent baseline)
    { const _cur=Object.keys(map), _seen=DB.settings.fixSeen;
      if(!Array.isArray(_seen)){ DB.settings.fixSeen=_cur; save.settings(); }
      else { const _fresh=_cur.filter(id=>!_seen.includes(id) && QMAP[id]);
        if(_fresh.length){ App.fixAlert={ids:_fresh}; toast("\u{1F527} "+_fresh.length+" reported question"+(_fresh.length>1?"s":"")+" just fixed"); } } }
    try{ wsSet("medrecall:remoteedits:v1", REMOTE_EDITS); }catch(e){}
    buildIndex();                        // rebuild + reapply (buildIndex calls applyEdits)
    if(App.screen==="home"||App.screen==="qedit") render();
  }catch(e){}
}
function postEdit(qid, patch){
  const ep=DB.settings.groupEndpoint; if(!ep) return false;
  const payload={type:"edit", editId:"e"+Date.now().toString(36), date:new Date().toISOString(), qid, patch, by:ensureAlias(), uid:lbId()};
  try{ fetch(ep,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(payload)}).catch(()=>{}); return true; }catch(e){ return false; }
}

// ---------- report alerts (maintainer) ----------
function reportRows(){ const d=(App.inboxRows||[]).slice(); if(d.length && Array.isArray(d[0]) && String(d[0][0]).toLowerCase().indexOf("when")>=0) d.shift(); return d; }
function unreadReports(){ return Math.max(0, reportRows().length-(DB.settings.reportSeen||0)); }
async function checkNewReports(){
  if(!DB.settings.maintainer || DB.settings.notifyReports===false) return;
  const ep=DB.settings.groupEndpoint; if(!ep) return;
  try{
    const u=ep+(ep.indexOf("?")>=0?"&":"?")+"reports=1&cb="+Date.now();
    const r=await fetch(u,{cache:"no-store"}); if(!r.ok) return;
    const data=await r.json();
    if(!Array.isArray(data) || (data.length && !Array.isArray(data[0]))) return;   // not upgraded
    App.inboxRows=data;
    const n=reportRows().length, seen=DB.settings.reportSeen||0;
    if(n>seen){
      const fresh=n-seen;
      if(notifSupported() && notifPermission()==="granted"){
        try{ const reg=await navigator.serviceWorker.ready; await reg.showNotification("MedCall · maintainer", { body:fresh+" new question report"+(fresh>1?"s":"")+" — tap to review & fix", tag:"medcall-report", data:{url:"./#reports"} }); }catch(e){}
      }
      if(App.screen==="home") render();
    }
  }catch(e){}
}

// ---------- in-app question editor ----------
function reportsForQid(qid){
  const out=[];
  reportRows().forEach(r=>{ if(String(r[4])===String(qid)) out.push({when:r[0], who:r[1], issue:r[5], note:r[6]}); });
  (DB.reports||[]).forEach(r=>{ if(String(r.qid)===String(qid)) out.push({when:r.date, who:"you (local)", issue:r.type, note:r.note}); });
  return out;
}
function qeInit(qid){
  const q=QMAP[qid];
  App.qedit={ qid, exists:!!q, draft: q ? {
    stem:q.stem||"", keyPoint:q.keyPoint||"",
    choices:(q.choices||[]).map(c=>({l:c.l, t:c.t, correct:!!c.correct, e:c.e||""})),
    flagSev:(q.flag&&q.flag.severity)||"", flagNote:(q.flag&&q.flag.note)||""
  } : null };
}
function qeSyncDraft(){
  const d=App.qedit&&App.qedit.draft; if(!d) return;
  const g=id=>$(id); const st=g("qe-stem"); if(st) d.stem=st.value;
  const kp=g("qe-keypoint"); if(kp) d.keyPoint=kp.value;
  const fs=g("qe-flagsev"); if(fs) d.flagSev=fs.value;
  const fn=g("qe-flagnote"); if(fn) d.flagNote=fn.value;
  d.choices.forEach((c,i)=>{ const t=g("qe-ct-"+i); if(t) c.t=t.value; const e=g("qe-ce-"+i); if(e) c.e=e.value; });
}
function qeBuildPatch(){
  const d=App.qedit.draft; reLetter(d.choices);
  return { stem:d.stem, keyPoint:d.keyPoint, choices:d.choices.map(c=>({l:c.l, t:c.t, correct:!!c.correct, e:c.e||undefined})), flag: d.flagSev? {severity:d.flagSev, note:d.flagNote, source:"maintainer in-app edit"} : null };
}
function viewQEditor(){
  const Q=App.qedit;
  const back=`<button class="btn-sm btn-ghost" data-action="open-reports-inbox" style="margin-bottom:12px"><svg class="i" viewBox="0 0 24 24" style="width:15px;height:15px"><path d="M15 18l-6-6 6-6"/></svg> Reports</button>`;
  if(!Q) return `<div class="fade">${back}<div class="empty">No question selected.</div></div>`;
  if(!Q.exists) return `<div class="fade">${back}<div class="card pad" style="border-left:3px solid var(--amber)"><b>Question not in the loaded bank</b><div class="faint" style="font-size:13px;margin-top:6px;line-height:1.5">QID <span class="mono">${esc(Q.qid)}</span> wasn't found in your synced bank — it may be from a newer/older version. Sync your bank (Settings → Sync now) or fix it directly in the source pack.</div></div></div>`;
  const d=Q.draft, reps=reportsForQid(Q.qid), q=QMAP[Q.qid], edited=!!(DB.settings.qedits&&DB.settings.qedits[Q.qid]);
  let html=`<div class="fade">${back}
    <div class="faint mono" style="font-size:11px;letter-spacing:.06em">EDIT · ${esc(Q.qid)} · ${esc(q.system||"")}${edited?' · <span style="color:var(--teal)">edited</span>':''}</div>
    <h2 class="serif" style="font-size:20px;font-weight:600;margin-top:2px">Question editor</h2>`;
  if(reps.length){ html+=`<div class="card pad" style="margin-top:8px;border-left:3px solid var(--amber)"><div class="faint" style="font-size:11px;text-transform:uppercase;letter-spacing:.06em">Reported ${reps.length}×</div>`;
    reps.slice(0,6).forEach(r=>{ html+=`<div style="font-size:13px;margin-top:6px"><b>${esc(r.issue||"Report")}</b>${r.note?" — "+esc(r.note):""} <span class="faint">· ${esc(fmtWhen(r.when))} · ${esc(r.who||"")}</span></div>`; });
    html+=`</div>`; }
  html+=`<div class="sectlabel">Stem</div><textarea id="qe-stem" class="inp" style="min-height:96px;width:100%">${esc(d.stem)}</textarea>`;
  html+=`<div class="sectlabel">Choices — tap the letter to mark the correct answer</div>`;
  d.choices.forEach((c,i)=>{ html+=`<div class="card pad" style="margin-bottom:8px">
    <div class="row" style="gap:8px;align-items:center">
      <button class="iconbtn" data-action="qedit-correct" data-i="${i}" title="Mark correct" style="flex:none;${c.correct?'background:var(--green);color:#04211e;border-color:var(--green);font-weight:700':''}">${c.correct?'✓':esc(c.l||String.fromCharCode(65+i))}</button>
      <input id="qe-ct-${i}" class="inp" value="${esc(c.t)}" placeholder="Option text" style="flex:1">
      <button class="iconbtn" data-action="qedit-delchoice" data-i="${i}" title="Remove" style="flex:none">✕</button>
    </div>
    <textarea id="qe-ce-${i}" class="inp" style="min-height:42px;margin-top:6px;width:100%" placeholder="Explanation (optional)">${esc(c.e||"")}</textarea>
  </div>`; });
  html+=`<button class="btn-sm btn-ghost" data-action="qedit-addchoice">+ Add choice</button>`;
  html+=`<div class="sectlabel">Key point</div><textarea id="qe-keypoint" class="inp" style="min-height:60px;width:100%">${esc(d.keyPoint)}</textarea>`;
  html+=`<div class="sectlabel">Flag (optional)</div>
    <select id="qe-flagsev" class="inp" style="width:100%"><option value="">No flag</option>${["CRITICAL","HIGH","MODERATE"].map(s=>`<option value="${s}"${d.flagSev===s?" selected":""}>${s}</option>`).join("")}</select>
    <div style="height:6px"></div>
    <textarea id="qe-flagnote" class="inp" style="min-height:48px;width:100%" placeholder="Flag note — the correction / why it's disputed">${esc(d.flagNote)}</textarea>`;
  html+=`<div style="height:14px"></div>
    <button class="btn btn-primary" data-action="qedit-save">Save fix${DB.settings.groupEndpoint?" &amp; share to group":""}</button>
    <div style="height:8px"></div>
    <div class="row" style="gap:8px"><button class="btn btn-ghost" data-action="qedit-copy" style="flex:1">Copy corrected JSON</button>${edited?`<button class="btn btn-ghost" data-action="qedit-revert" style="flex:1">Revert my edit</button>`:""}</div>
    <div class="faint" style="font-size:11.5px;margin-top:10px;line-height:1.5">Saving applies the fix on this device immediately and (if your group Script is connected) shares it so every device gets it on next open. Use <b>Copy corrected JSON</b> to also bake it into the source pack on GitHub permanently.</div>`;
  html+=`</div>`; return html;
}

/* ============================================================
   BOOT
   ============================================================ */
// Where the question bank + leaderboard live. Used when the app runs as a
// downloaded file (file://) so it can still phone home for updates.
const REMOTE_BANK = "https://raw.githubusercontent.com/Fulcrum003/medcall-bank/main/";
function defaultBase(){
  if(location.protocol==="http:"||location.protocol==="https:"){
    // hosted next to its own bank (e.g. GitHub Pages) → use same origin
    let u=location.href.split("#")[0].split("?")[0].replace(/\/[^\/]*\.html?$/i,"/");
    if(!u.endsWith("/")) u+="/";
    return u;
  }
  return REMOTE_BANK; // downloaded file → fetch the bank directly from the repo
}

// offline app shell
if("serviceWorker" in navigator && (location.protocol==="https:"||location.protocol==="http:")){
  window.addEventListener("load", ()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));
}
if(typeof navigator!=="undefined" && "serviceWorker" in navigator && navigator.serviceWorker.addEventListener){ navigator.serviceWorker.addEventListener("message", (e)=>{ if(e.data==="open-reports"){ App.screen="reportsinbox"; App.inboxState="loading"; render(); fetchReports(); } }); }
if(typeof document!=="undefined"){ document.addEventListener("visibilitychange", ()=>{ if(!document.hidden){ scheduleReminders(); if(DB.settings.maintainer) checkNewReports(); } }); }

export async function boot(){
  await loadDB();
  try{ if(navigator.storage && navigator.storage.persist){ let ps = navigator.storage.persisted ? await navigator.storage.persisted() : false; if(!ps) ps = await navigator.storage.persist(); App.persisted = ps; } }catch(e){}
  if(DB.settings.soundDefaulted===undefined){ DB.settings.sounds=true; DB.settings.soundDefaulted=true; save.settings(); }
  applyTheme();
  try{ ghToken = await wsGet("medrecall:ghtoken:v1"); }catch(e){}
  try{ wallImg = await wsGet("medrecall:wallpaperimg:v1"); }catch(e){}
  applyWallpaper();
  // instant + offline start from the cached bank
  try{ const cached = await wsGet("medrecall:bankcache:v1"); if(cached && cached.length){ BANK.length=0; cached.forEach(p=>BANK.push(p)); } }catch(e){}
  try{ REMOTE_EDITS = (await wsGet("medrecall:remoteedits:v1"))||{}; }catch(e){}
  buildIndex();
  render();
  // revalidate from the network when online
  const base = DB.settings.bankUrl || defaultBase();
  if(base){ try{ await syncBank(base); if(App.screen==="home") render(); }catch(e){ /* offline → keep cached/bundled bank */ } }
  // keep the group board fresh (posts your score + pulls others) once the endpoint is known
  if(DB.settings.groupEndpoint || DB.settings.lbRepo){ syncBoard(); }
  notifCfg(); scheduleReminders(); inAppNotifyCheck();
  fetchEdits(); if(DB.settings.maintainer) checkNewReports();
  if((location.hash||"").indexOf("reports")>=0 && DB.settings.maintainer){ App.screen="reportsinbox"; App.inboxState="loading"; render(); fetchReports(); }
}

// Auto-start in browser only (guard prevents running in test environment)
if (typeof document !== "undefined" && document.getElementById("app")) {
  boot();
}

export function resetDB() {
  DB.progress = { questions: {}, resume: null, streak: { current: 0, lastStudied: null }, checklist: {}, timeLog: {}, timer: null };
  DB.exams = [];
  DB.reports = [];
  DB.settings = { newPerDay: 20, passMark: 50, maintainer: false, wallpaper: "ink", theme: "dark", dailyGoal: 20, sounds: true, examDate: "", revealOnPick: true, notif: { enabled:false, daily:true, due:true, streak:true, exam:true, time:"19:00", lastFired:{} } };
}
/* clinic-v1.4 */
