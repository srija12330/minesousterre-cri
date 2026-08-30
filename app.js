// =====================================================================
// SALLE EPI — CANADIAN ROYALTIES
// L'inventaire est l'écran principal. − = sortie, + = réception.
// =====================================================================

const SUPABASE_URL = 'https://bcomfkechyrvrbourhbr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjb21ma2VjaHlydnJib3VyaGJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM4MTIxNjMsImV4cCI6MjA5OTM4ODE2M30.zwOslsZruNnap5TrBOIBUkhhROvxumEPeOqZ1oDcN4w';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let utilisateur = null;
let ARTICLES = [];
let EMPLOYES = [];
let POSTES = [];
let filtreStatut = 'TOUS';
let dernierEmploye = null;   // pré-rempli à la sortie suivante (un gars prend souvent 3-4 items)
let employeChoisi = null;    // sélection courante dans la modale de sortie
let ANALYSE_LIGNES = [];
let ANALYSE_NOMS = [];
let ANALYSE_META = null;
let EMP_FILTRE = 'ACTIFS';
let EMP_LISTE = [];   // liste affichée dans l'onglet Employés (index pour les clics)
let EMP_STATS = null;   // cache de l'onglet Employés

// ---------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------
(async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { location.replace('login.html'); return; }
  utilisateur = session.user;
  await chargerTout();
  document.body.classList.add('pret');
})();

async function deconnexion() {
  await sb.auth.signOut();
  location.replace('login.html');
}

// ---------------------------------------------------------------
// Lecture paginée (Supabase plafonne à 1000 lignes par requête)
// ---------------------------------------------------------------
async function toutLire(table, colonnes = '*', ordre = null, filtres = null) {
  const PAGE = 1000;
  let tout = [], depuis = 0;
  while (true) {
    let q = sb.from(table).select(colonnes).range(depuis, depuis + PAGE - 1);
    if (ordre) q = q.order(ordre.col, { ascending: ordre.asc });
    if (filtres) q = filtres(q);
    const { data, error } = await q;
    if (error) { toast('Erreur de lecture : ' + error.message, 'err'); return tout; }
    tout = tout.concat(data);
    if (data.length < PAGE) break;
    depuis += PAGE;
  }
  return tout;
}

async function chargerTout() {
  [ARTICLES, EMPLOYES, POSTES] = await Promise.all([
    toutLire('vue_stock', '*', { col: 'nom_complet', asc: true }),
    toutLire('employes', '*', { col: 'nom', asc: true }),
    toutLire('postes', '*', { col: 'nom', asc: true }),
  ]);
  rendreInventaire();
  rendreEmployes();
  rendreAnalyse();
}

async function rechargerStock() {
  ARTICLES = await toutLire('vue_stock', '*', { col: 'nom_complet', asc: true });
  rendreInventaire();
}

// ---------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------
function echap(t) {
  return String(t ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function normaliser(t) {
  return String(t ?? '').toLowerCase()
    .replace(/œ/g,'oe').replace(/æ/g,'ae')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'');
}
function dollars(n) {
  return (+n || 0).toLocaleString('fr-CA', { style:'currency', currency:'CAD' });
}
function aujourdhui() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function toast(msg, type = 'ok') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'visible ' + type;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.className = '', 2600);
}
function onglet(nom) {
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('actif', b.dataset.onglet === nom));
  document.querySelectorAll('main section').forEach(s => s.classList.toggle('actif', s.id === nom));
  if (nom === 'mouvements') rendreMouvements();
  if (nom === 'employes') rendreEmployes();
  if (nom === 'analyses') rendreAnalyse();
}
function pas(id, delta) {
  const el = document.getElementById(id);
  el.value = Math.max(1, (parseInt(el.value) || 1) + delta);
  const ev = document.getElementById('m-conversion');
  if (ev) majConversion();
}
function fermerModale() { document.getElementById('voile').classList.remove('ouvert'); }
function ouvrirModale(html) {
  document.getElementById('modale-contenu').innerHTML = html;
  document.getElementById('voile').classList.add('ouvert');
}

// =====================================================================
// INVENTAIRE — l'écran principal
// =====================================================================
function filtreInv(f) {
  filtreStatut = f;
  document.querySelectorAll('#inventaire .filtres button').forEach(b => b.classList.toggle('actif', b.dataset.f === f));
  rendreInventaire();
}

function rendreInventaire() {
  const q = normaliser(document.getElementById('k-recherche').value.trim());
  let liste = ARTICLES.filter(a => a.actif);
  if (q) liste = liste.filter(a => normaliser(a.nom_complet).includes(q) || normaliser(a.code_guide_ti).includes(q));
  if (filtreStatut !== 'TOUS') liste = liste.filter(a => a.statut === filtreStatut);

  const poids = { RUPTURE: 0, BAS: 1, OK: 2 };
  liste.sort((a, b) => (poids[a.statut] - poids[b.statut]) || a.nom_complet.localeCompare(b.nom_complet, 'fr'));

  const nR = ARTICLES.filter(a => a.actif && a.statut === 'RUPTURE').length;
  const nB = ARTICLES.filter(a => a.actif && a.statut === 'BAS').length;
  const valeur = ARTICLES.filter(a => a.actif).reduce((s, a) => s + (+a.valeur_stock || 0), 0);
  document.getElementById('k-sommaire').textContent =
    `${liste.length} article(s) · ${nR} en rupture · ${nB} sous le seuil · valeur : ${dollars(valeur)}`;

  const zone = document.getElementById('k-liste');
  if (!liste.length) { zone.innerHTML = '<div class="vide">Aucun article ne correspond.</div>'; return; }
  zone.innerHTML = liste.map(a => {
    const badge = a.statut === 'RUPTURE' ? ' <span class="pastille p-rupture">RUPTURE</span>'
                : a.statut === 'BAS'     ? ' <span class="pastille p-bas">BAS</span>' : '';
    const classeCompte = a.stock_actuel < 0 ? 'neg' : (a.statut === 'BAS' ? 'bas' : '');
    return `
    <div class="ligne-inv">
      <div class="info" onclick="ouvrirFiche(${a.id})" title="Ouvrir la fiche">
        <div class="nom">${echap(a.nom_complet)}${badge}</div>
        <div class="meta">${a.prix_unitaire != null ? dollars(a.prix_unitaire) : 'prix ?'}${a.seuil_min != null ? ' · seuil ' + a.seuil_min : ''}${a.code_guide_ti ? ' · ' + echap(a.code_guide_ti) : ''}</div>
      </div>
      <div class="compte ${classeCompte}">${a.stock_actuel}</div>
      <div class="actions">
        <button class="b-moins" title="Sortie" onclick="modaleSortie(${a.id})">−</button>
        <button class="b-plus" title="Réception" onclick="modaleReception(${a.id})">＋</button>
      </div>
    </div>`;
  }).join('');
}

// ---------------------------------------------------------------
// SORTIE : bouton − sur la ligne → une seule petite fenêtre
// ---------------------------------------------------------------
function modaleSortie(id) {
  const a = ARTICLES.find(x => x.id === id);
  if (!a) return;
  employeChoisi = dernierEmploye;   // pré-rempli : le même gars prend souvent plusieurs items
  ouvrirModale(`
    <h3>Sortie : ${echap(a.nom_complet)}</h3>
    <p class="sous">Stock actuel : <strong>${a.stock_actuel}</strong></p>

    <label>Quantité</label>
    <div class="qte">
      <button type="button" onclick="pas('m-qte',-1)">−</button>
      <input id="m-qte" type="number" min="1" value="1" inputmode="numeric">
      <button type="button" onclick="pas('m-qte',1)">+</button>
    </div>

    <label>Employé</label>
    <div class="auto">
      <input id="m-employe" placeholder="Tapez ou choisissez…" autocomplete="off"
             value="${employeChoisi ? echap(employeChoisi.nom) : ''}">
      <div class="auto-liste" id="m-employe-liste"></div>
    </div>

    <label>Poste</label>
    <select id="m-poste">
      <option value="">Choisir un poste</option>
      ${POSTES.filter(p => p.actif).map(p => `<option${employeChoisi && employeChoisi.poste === p.nom ? ' selected' : ''}>${echap(p.nom)}</option>`).join('')}
    </select>

    <label>Commentaire <span style="font-weight:400;color:var(--gris)">(facultatif)</span></label>
    <input id="m-comm">

    <div class="modale-actions">
      <button class="btn-second" style="flex:1" onclick="fermerModale()">Annuler</button>
      <button class="btn-principal" style="flex:2;margin:0" id="m-btn" onclick="validerSortie(${a.id})">Enregistrer la sortie</button>
    </div>
  `);
  brancherEmployeModale();
  if (!employeChoisi) setTimeout(() => document.getElementById('m-employe').focus(), 60);
}

function brancherEmployeModale() {
  const input = document.getElementById('m-employe');
  const liste = document.getElementById('m-employe-liste');
  let items = [];

  function rendre() {
    const q = normaliser(input.value.trim());
    const saisie = input.value.trim();
    items = EMPLOYES
      .filter(e => e.actif && (!q || normaliser(e.nom).includes(q)))
      .slice(0, 8)
      .map(e => ({ html: `${echap(e.nom)} <span class="meta">· ${echap(e.poste || 'poste ?')}</span>`, employe: e }));
    if (saisie.length >= 3 && !EMPLOYES.some(e => normaliser(e.nom) === q)) {
      items.push({ html: `＋ Ajouter «&nbsp;${echap(saisie)}&nbsp;»`, classe: 'nouveau', nouveau: saisie });
    }
    if (!items.length) { liste.style.display = 'none'; return; }
    liste.innerHTML = items.map((it, i) => `<div data-i="${i}" class="${it.classe || ''}">${it.html}</div>`).join('');
    liste.style.display = 'block';
    liste.querySelectorAll('div').forEach(div => {
      div.onmousedown = async (e) => {
        e.preventDefault();
        const it = items[+div.dataset.i];
        if (it.nouveau) {
          const { data, error } = await sb.from('employes').insert({ nom: it.nouveau }).select().single();
          if (error) { toast('Impossible d\'ajouter : ' + error.message, 'err'); return; }
          EMPLOYES.push(data); EMPLOYES.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
          employeChoisi = data;
          input.value = data.nom;
          toast(`${data.nom} ajouté. Choisissez son poste.`);
          document.getElementById('m-poste').focus();
        } else {
          employeChoisi = it.employe;
          input.value = it.employe.nom;
          document.getElementById('m-poste').value = it.employe.poste || '';
        }
        liste.style.display = 'none';
      };
    });
  }

  input.addEventListener('focus', rendre);
  input.addEventListener('input', () => { employeChoisi = null; rendre(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && liste.style.display === 'block' && items.length) {
      e.preventDefault();
      const it = items[0];
      liste.querySelector('div').onmousedown(new Event('mousedown'));
    }
    if (e.key === 'Escape') liste.style.display = 'none';
  });
  input.addEventListener('blur', () => setTimeout(() => liste.style.display = 'none', 150));
}

async function validerSortie(id) {
  const a = ARTICLES.find(x => x.id === id);
  const btn = document.getElementById('m-btn');
  const qte = parseInt(document.getElementById('m-qte').value) || 0;
  const poste = document.getElementById('m-poste').value || null;
  const nomTape = document.getElementById('m-employe').value.trim();

  if (qte < 1) { toast('Quantité invalide.', 'err'); return; }
  if (nomTape && (!employeChoisi || employeChoisi.nom !== nomTape)) {
    toast('Choisissez l\'employé dans la liste (ou ajoutez-le).', 'err'); return;
  }

  btn.disabled = true;
  const { error } = await sb.from('mouvements').insert({
    date_mouvement: aujourdhui(),
    article_id: a.id,
    type: 'SORTIE',
    quantite: qte,
    employe_id: employeChoisi ? employeChoisi.id : null,
    employe_nom: employeChoisi ? employeChoisi.nom : null,
    poste: poste,
    prix_unitaire_capture: a.prix_unitaire,
    commentaire: document.getElementById('m-comm').value.trim() || null,
    saisi_par: utilisateur.email
  });
  btn.disabled = false;
  if (error) { toast('Erreur : ' + error.message, 'err'); return; }

  if (employeChoisi && poste && employeChoisi.poste !== poste) {
    await sb.from('employes').update({ poste }).eq('id', employeChoisi.id);
    employeChoisi.poste = poste;
  }
  dernierEmploye = employeChoisi;
  EMP_STATS = null;   // les totaux par employé seront recalculés
  MVT_CACHE = null;

  toast(`−${qte} ${a.nom_complet}${employeChoisi ? ' → ' + employeChoisi.nom : ''}`);
  fermerModale();
  rechargerStock();
}

// ---------------------------------------------------------------
// RÉCEPTION : bouton + sur la ligne
// ---------------------------------------------------------------
function modaleReception(id) {
  const a = ARTICLES.find(x => x.id === id);
  if (!a) return;
  ouvrirModale(`
    <h3>Réception : ${echap(a.nom_complet)}</h3>
    <p class="sous">Stock actuel : <strong>${a.stock_actuel}</strong></p>

    <label>Quantité</label>
    <div class="rangée">
      <div class="qte" style="flex:2">
        <button type="button" onclick="pas('m-qte',-1)">−</button>
        <input id="m-qte" type="number" min="1" value="1" inputmode="numeric">
        <button type="button" onclick="pas('m-qte',1)">+</button>
      </div>
      <select id="m-unite" style="flex:1.2" onchange="majConversion()" data-cond="${a.conditionnement || 1}">
        <option value="unite">unités</option>
        <option value="boite">boîtes</option>
      </select>
    </div>
    <div class="indicateur" id="m-conversion" style="margin-top:6px"></div>

    <label>Nouveau prix unitaire <span style="font-weight:400;color:var(--gris)">(actuel : ${a.prix_unitaire != null ? dollars(a.prix_unitaire) : 'aucun'}, laisser vide si inchangé)</span></label>
    <input id="m-prix" type="number" step="0.01" min="0" inputmode="decimal">

    <label>Commentaire <span style="font-weight:400;color:var(--gris)">(No de commande, fournisseur…)</span></label>
    <input id="m-comm">

    <div class="modale-actions">
      <button class="btn-second" style="flex:1" onclick="fermerModale()">Annuler</button>
      <button class="btn-principal" style="flex:2;margin:0" id="m-btn" onclick="validerReception(${a.id})">Enregistrer la réception</button>
    </div>
  `);
  document.getElementById('m-qte').addEventListener('input', majConversion);
}

function majConversion() {
  const sel = document.getElementById('m-unite');
  const ind = document.getElementById('m-conversion');
  if (!sel || !ind) return;
  const cond = parseInt(sel.dataset.cond) || 1;
  const qte = parseInt(document.getElementById('m-qte').value) || 0;
  if (sel.value === 'boite') ind.textContent = `${qte} boîte(s) × ${cond}/boîte = ${qte * cond} unités ajoutées`;
  else ind.textContent = cond > 1 ? `Conditionnement : ${cond}/boîte` : '';
}

async function validerReception(id) {
  const a = ARTICLES.find(x => x.id === id);
  const btn = document.getElementById('m-btn');
  const qteSaisie = parseInt(document.getElementById('m-qte').value) || 0;
  const unite = document.getElementById('m-unite').value;
  const prixTexte = document.getElementById('m-prix').value.trim();
  if (qteSaisie < 1) { toast('Quantité invalide.', 'err'); return; }

  const cond = a.conditionnement || 1;
  const qte = unite === 'boite' ? qteSaisie * cond : qteSaisie;

  btn.disabled = true;
  let prixCapture = a.prix_unitaire;
  if (prixTexte !== '') {
    const p = parseFloat(prixTexte);
    if (!isNaN(p) && p >= 0) {
      const { error: e1 } = await sb.from('articles').update({ prix_unitaire: p }).eq('id', a.id);
      if (e1) { toast('Erreur prix : ' + e1.message, 'err'); btn.disabled = false; return; }
      prixCapture = p;
    }
  }

  const { error } = await sb.from('mouvements').insert({
    date_mouvement: aujourdhui(),
    article_id: a.id,
    type: 'AJOUT',
    quantite: qte,
    prix_unitaire_capture: prixCapture,
    commentaire: document.getElementById('m-comm').value.trim() ||
                 (unite === 'boite' ? `${qteSaisie} boîte(s) × ${cond}` : null),
    saisi_par: utilisateur.email
  });
  btn.disabled = false;
  if (error) { toast('Erreur : ' + error.message, 'err'); return; }

  MVT_CACHE = null;
  toast(`+${qte} ${a.nom_complet}`);
  fermerModale();
  rechargerStock();
}

// ---------------------------------------------------------------
// FICHE ARTICLE : clic sur le nom → modifier, décompte, historique
// ---------------------------------------------------------------
async function ouvrirFiche(id) {
  const a = ARTICLES.find(x => x.id === id);
  if (!a) return;
  ouvrirModale(`
    <h3>${echap(a.nom_complet)}</h3>
    <p class="sous">Stock : <strong>${a.stock_actuel}</strong> · sorti au total : ${a.total_sorties} · reçu : ${a.total_ajouts}</p>

    <label>Décompte physique <span style="font-weight:400;color:var(--gris)">(combien il y en a vraiment sur les tablettes)</span></label>
    <div class="rangée">
      <input id="f-decompte" type="number" inputmode="numeric" placeholder="${a.stock_actuel}">
      <button class="btn-second" style="flex:0 0 auto" onclick="appliquerDecompte(${a.id})">Ajuster</button>
    </div>

    <div class="rangée">
      <div><label>Prix unitaire ($)</label><input id="f-prix" type="number" step="0.01" min="0" value="${a.prix_unitaire ?? ''}"></div>
      <div><label>Seuil minimum</label><input id="f-seuil" type="number" min="0" inputmode="numeric" value="${a.seuil_min ?? ''}"></div>
    </div>
    <div class="rangée">
      <div><label>Unités / boîte</label><input id="f-cond" type="number" min="1" inputmode="numeric" value="${a.conditionnement ?? 1}"></div>
      <div><label>Code GUIDE TI</label><input id="f-code" value="${echap(a.code_guide_ti ?? '')}"></div>
    </div>

    <div class="modale-actions">
      <button class="btn-second" style="flex:1" onclick="fermerModale()">Fermer</button>
      <button class="btn-principal" style="flex:2;margin:0" onclick="sauverFiche(${a.id})">Enregistrer la fiche</button>
    </div>

    <label style="margin-top:20px">Coûts historiques</label>
    <div id="f-couts"><div class="vide">Vérification…</div></div>

    <label style="margin-top:20px">Derniers mouvements</label>
    <div id="f-historique"><div class="vide">Chargement…</div></div>

    <button class="btn-second" style="width:100%;margin-top:14px;color:var(--rouge);border-color:var(--rouge-pale)"
      onclick="desactiverArticle(${a.id})">Retirer cet article de la liste</button>
  `);

  chargerCoutsHistoriques(a);

  const { data } = await sb.from('mouvements')
    .select('id, date_mouvement, type, quantite, employe_nom, commentaire')
    .eq('article_id', id)
    .order('date_mouvement', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false }).limit(8);
  const zone = document.getElementById('f-historique');
  if (!zone) return;
  if (!data || !data.length) { zone.innerHTML = '<div class="vide">Aucun mouvement.</div>'; return; }
  zone.innerHTML = data.map(m => `
    <div class="journal-item">
      <div class="detail">
        <strong>${m.type === 'SORTIE' ? '−' : '+'}${Math.abs(m.quantite)}</strong> ${m.type.toLowerCase()}
        <div class="meta">${m.date_mouvement || 'sans date'}${m.employe_nom ? ' · ' + echap(m.employe_nom) : ''}${m.commentaire ? ' · ' + echap(m.commentaire) : ''}</div>
      </div>
      <button class="suppr" title="Annuler cette saisie" onclick="supprimerMouvement(${m.id}, ${id})">✕</button>
    </div>`).join('');
}

async function supprimerMouvement(mid, articleId) {
  if (!confirm('Annuler cette saisie ? Le stock sera recalculé.')) return;
  const { error } = await sb.from('mouvements').delete().eq('id', mid);
  if (error) { toast('Erreur : ' + error.message, 'err'); return; }
  EMP_STATS = null;
  MVT_CACHE = null;
  toast('Saisie annulée');
  await rechargerStock();
  ouvrirFiche(articleId);
}

// ---------------------------------------------------------------
// COÛTS HISTORIQUES : détecter les prix figés qui divergent de la
// fiche (faute de frappe héritée), et offrir la correction.
// Les AJUSTEMENT ne sont jamais touchés.
// ---------------------------------------------------------------
async function chargerCoutsHistoriques(a) {
  const zone = document.getElementById('f-couts');
  if (!zone) return;

  const mvts = await toutLire('mouvements', 'id, type, prix_unitaire_capture',
    null, q => q.eq('article_id', a.id).in('type', ['SORTIE', 'AJOUT']));

  if (!mvts.length) { zone.innerHTML = '<div class="vide">Aucun mouvement.</div>'; return; }

  // regrouper par prix figé
  const parPrix = new Map();
  mvts.forEach(m => {
    const p = m.prix_unitaire_capture == null ? null : Math.round(+m.prix_unitaire_capture * 100) / 100;
    parPrix.set(p, (parPrix.get(p) || 0) + 1);
  });

  const prixFiche = a.prix_unitaire == null ? null : Math.round(+a.prix_unitaire * 100) / 100;
  const divergents = [...parPrix.entries()].filter(([p]) => p !== prixFiche);
  const nDivergents = divergents.reduce((s, [, n]) => s + n, 0);

  let html = [...parPrix.entries()]
    .sort((x, y) => (y[1] - x[1]))
    .map(([p, n]) => {
      const ok = p === prixFiche;
      const libelle = p == null ? 'sans prix' : dollars(p);
      return `<div class="journal-item">
        <div class="detail">${ok ? '✓' : '⚠'} <strong>${libelle}</strong>
          <span class="meta">${ok ? '(concorde avec la fiche)' : '(ne concorde pas, fiche : ' + (prixFiche == null ? 'sans prix' : dollars(prixFiche)) + ')'} · ${n} mouvement(s)</span>
        </div>
      </div>`;
    }).join('');

  if (nDivergents > 0) {
    html += `
    <div style="background:var(--jaune-pale);border-radius:8px;padding:12px;margin-top:10px;font-size:13px;line-height:1.5">
      <strong>${nDivergents} mouvement(s)</strong> portent un autre prix que la fiche.<br>
      À corriger <strong>seulement si l'ancien prix était une erreur de saisie</strong>.
      Si le prix a réellement changé avec le temps, ne touchez à rien : l'historique doit rester fidèle.
    </div>
    <button class="btn-second" style="width:100%;margin-top:10px" id="f-corriger"
      onclick="corrigerCoutsHistoriques(${a.id})">Corriger l'historique au prix de la fiche (${prixFiche == null ? 'sans prix' : dollars(prixFiche)})</button>`;
  }
  zone.innerHTML = html;
}

async function corrigerCoutsHistoriques(id) {
  const a = ARTICLES.find(x => x.id === id);
  if (!a) return;
  if (a.prix_unitaire == null) { toast('Mettez d\'abord un prix sur la fiche.', 'err'); return; }
  if (!confirm(
    `Réécrire le prix de TOUS les mouvements de « ${a.nom_complet} » à ${dollars(a.prix_unitaire)} ?\n\n` +
    `À faire seulement pour corriger une erreur de saisie.\n` +
    `Les montants et les totaux par employé seront recalculés.`)) return;

  const btn = document.getElementById('f-corriger');
  if (btn) { btn.disabled = true; btn.textContent = 'Correction en cours…'; }

  const { error } = await sb.from('mouvements')
    .update({ prix_unitaire_capture: a.prix_unitaire })
    .eq('article_id', id)
    .in('type', ['SORTIE', 'AJOUT']);
  if (error) { toast('Erreur : ' + error.message, 'err'); if (btn) btn.disabled = false; return; }

  // tout ce qui affiche des montants doit se recalculer
  EMP_STATS = null;
  MVT_CACHE = null;
  toast('Historique corrigé, montants recalculés');
  await rechargerStock();
  ouvrirFiche(id);
}

async function sauverFiche(id) {
  const prix = document.getElementById('f-prix').value.trim();
  const seuil = document.getElementById('f-seuil').value.trim();
  const cond = document.getElementById('f-cond').value.trim();
  const { error } = await sb.from('articles').update({
    prix_unitaire: prix === '' ? null : parseFloat(prix),
    seuil_min: seuil === '' ? null : parseInt(seuil),
    conditionnement: cond === '' ? 1 : Math.max(1, parseInt(cond)),
    code_guide_ti: document.getElementById('f-code').value.trim() || null
  }).eq('id', id);
  if (error) { toast('Erreur : ' + error.message, 'err'); return; }
  toast('Fiche enregistrée');
  fermerModale();
  rechargerStock();
}

async function appliquerDecompte(id) {
  const a = ARTICLES.find(x => x.id === id);
  const compte = document.getElementById('f-decompte').value.trim();
  if (compte === '') { toast('Entrez le nombre compté.', 'err'); return; }
  const reel = parseInt(compte);
  const delta = reel - a.stock_actuel;
  if (delta === 0) { toast('Déjà exact, rien à ajuster.'); return; }
  const { error } = await sb.from('mouvements').insert({
    date_mouvement: aujourdhui(),
    article_id: id,
    type: 'AJUSTEMENT',
    quantite: delta,
    commentaire: `Décompte physique : ${a.stock_actuel} → ${reel}`,
    saisi_par: utilisateur.email
  });
  if (error) { toast('Erreur : ' + error.message, 'err'); return; }
  MVT_CACHE = null;
  toast(`Ajusté : ${delta > 0 ? '+' : ''}${delta} (stock = ${reel})`);
  fermerModale();
  rechargerStock();
}

async function desactiverArticle(id) {
  if (!confirm('Retirer cet article des listes ? Son historique est conservé.')) return;
  const { error } = await sb.from('articles').update({ actif: false }).eq('id', id);
  if (error) { toast('Erreur : ' + error.message, 'err'); return; }
  toast('Article retiré');
  fermerModale();
  rechargerStock();
}

// ---- Nouvel article
function ouvrirNouvelArticle() {
  ouvrirModale(`
    <h3>Nouvel article</h3>
    <p class="sous">Ex. de nom complet : «&nbsp;Gants BO500 - XL - Kosto&nbsp;»</p>
    <label>Nom complet</label>
    <input id="n-nomc" placeholder="Article - taille - marque">
    <div class="rangée">
      <div><label>Taille</label><input id="n-taille" placeholder="XL, 10, 42…"></div>
      <div><label>Marque</label><input id="n-marque" placeholder="Kosto, 3M…"></div>
    </div>
    <div class="rangée">
      <div><label>Prix unitaire ($)</label><input id="n-prix" type="number" step="0.01" min="0"></div>
      <div><label>Stock de départ</label><input id="n-stock" type="number" min="0" value="0" inputmode="numeric"></div>
    </div>
    <div class="rangée">
      <div><label>Seuil minimum</label><input id="n-seuil" type="number" min="0" inputmode="numeric"></div>
      <div><label>Unités / boîte</label><input id="n-cond" type="number" min="1" value="1" inputmode="numeric"></div>
    </div>
    <label>Code GUIDE TI</label>
    <input id="n-code">
    <div class="modale-actions">
      <button class="btn-second" style="flex:1" onclick="fermerModale()">Annuler</button>
      <button class="btn-principal" style="flex:2;margin:0" onclick="creerArticle()">Créer l'article</button>
    </div>
  `);
}

async function creerArticle() {
  const nomc = document.getElementById('n-nomc').value.trim();
  if (!nomc) { toast('Le nom complet est obligatoire.', 'err'); return; }
  const taille = document.getElementById('n-taille').value.trim();
  const marque = document.getElementById('n-marque').value.trim();
  let nom = nomc;
  [taille, marque].forEach(x => { if (x) nom = nom.replace(new RegExp('\\s*-\\s*' + x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + '\\s*'), ' ').trim(); });

  const prix = document.getElementById('n-prix').value.trim();
  const seuil = document.getElementById('n-seuil').value.trim();
  const { error } = await sb.from('articles').insert({
    nom_complet: nomc,
    nom: nom || nomc,
    taille: taille || null,
    marque: marque || null,
    code_guide_ti: document.getElementById('n-code').value.trim() || null,
    prix_unitaire: prix === '' ? null : parseFloat(prix),
    stock_initial: parseInt(document.getElementById('n-stock').value) || 0,
    seuil_min: seuil === '' ? null : parseInt(seuil),
    conditionnement: Math.max(1, parseInt(document.getElementById('n-cond').value) || 1)
  });
  if (error) {
    toast(error.code === '23505' ? 'Un article porte déjà ce nom.' : 'Erreur : ' + error.message, 'err');
    return;
  }
  toast('Article créé');
  fermerModale();
  rechargerStock();
}

// =====================================================================
// MOUVEMENTS — le journal complet : quoi, qui, quand, commentaire
// =====================================================================
let MVT_FILTRE = 'TOUS';
let MVT_LIMITE = 50;
let MVT_CACHE = null;

function filtreMvt(f) {
  MVT_FILTRE = f;
  MVT_LIMITE = 50;
  document.querySelectorAll('#mouvements .filtres button').forEach(b => b.classList.toggle('actif', b.dataset.f === f));
  rendreMouvements();
}

function effacerDatesMvt() {
  document.getElementById('m-du').value = '';
  document.getElementById('m-au').value = '';
  MVT_LIMITE = 50;
  rendreMouvements();
}

function chargerPlusMouvements() {
  MVT_LIMITE += 100;
  rendreMouvements(true);   // pas besoin de relire la base
}

async function rendreMouvements(depuisCache = false) {
  if (!MVT_CACHE || !depuisCache) {
    MVT_CACHE = await toutLire('mouvements',
      'id, date_mouvement, type, quantite, employe_nom, poste, prix_unitaire_capture, montant, commentaire, saisi_par, created_at, articles(nom_complet)',
      null,
      q => q.order('date_mouvement', { ascending: false, nullsFirst: false })
            .order('id', { ascending: false }));
  }
  const q = normaliser(document.getElementById('m-recherche').value.trim());

  const du = document.getElementById('m-du').value;
  const au = document.getElementById('m-au').value;

  let liste = MVT_CACHE;
  if (MVT_FILTRE !== 'TOUS') liste = liste.filter(m => m.type === MVT_FILTRE);
  if (du) liste = liste.filter(m => m.date_mouvement && m.date_mouvement >= du);
  if (au) liste = liste.filter(m => m.date_mouvement && m.date_mouvement <= au);
  if (q) liste = liste.filter(m =>
    normaliser(m.articles?.nom_complet).includes(q) ||
    normaliser(m.employe_nom).includes(q) ||
    normaliser(m.poste).includes(q) ||
    normaliser(m.commentaire).includes(q));

  document.getElementById('m-sommaire').textContent =
    `${liste.length} mouvement(s)` +
    (du || au ? ` · du ${du || 'début'} au ${au || 'aujourd\'hui'}` : '') +
    (q || MVT_FILTRE !== 'TOUS' ? ' (filtré)' : '');

  const zone = document.getElementById('m-liste');
  const visibles = liste.slice(0, MVT_LIMITE);
  if (!visibles.length) { zone.innerHTML = '<div class="vide">Aucun mouvement ne correspond.</div>'; }
  else {
    // regroupé par date, du plus récent au plus ancien
    let html = '', jourCourant = null;
    visibles.forEach(m => {
      const jour = m.date_mouvement || 'Sans date';
      if (jour !== jourCourant) {
        jourCourant = jour;
        html += `<div class="jour-titre">${jour}</div>`;
      }
      const t = m.type === 'SORTIE' ? `<span class="t-sortie">−${m.quantite}</span>`
              : m.type === 'AJOUT'  ? `<span class="t-ajout">+${m.quantite}</span>`
              : `<span class="t-ajust">${m.quantite > 0 ? '+' : ''}${m.quantite} ajust.</span>`;
      html += `
      <div class="journal-item">
        <div class="detail">
          ${t} ${echap(m.articles?.nom_complet || '?')}
          <div class="meta">${m.employe_nom ? echap(m.employe_nom) : (m.type === 'SORTIE' ? 'Sans nom' : '')}${m.poste ? ' · ' + echap(m.poste) : ''}${m.commentaire ? ' · ' + echap(m.commentaire) : ''}</div>
        </div>
        <button class="suppr" title="Annuler cette saisie" onclick="supprimerMouvementJournal(${m.id})">✕</button>
      </div>`;
    });
    zone.innerHTML = html;
  }
  document.getElementById('m-plus').style.display = liste.length > MVT_LIMITE ? 'block' : 'none';
}

async function supprimerMouvementJournal(mid) {
  if (!confirm('Annuler cette saisie ? Le stock sera recalculé.')) return;
  const { error } = await sb.from('mouvements').delete().eq('id', mid);
  if (error) { toast('Erreur : ' + error.message, 'err'); return; }
  EMP_STATS = null;
  MVT_CACHE = null;
  toast('Saisie annulée');
  rechargerStock();
  rendreMouvements();
}

// =====================================================================
// EMPLOYÉS — qui a pris quoi, pour combien
// =====================================================================
async function chargerStatsEmployes() {
  const mvts = await toutLire('mouvements',
    'employe_nom, poste, quantite, montant',
    null,
    q => q.eq('type', 'SORTIE'));
  const agg = new Map();
  mvts.forEach(m => {
    const cle = m.employe_nom || 'Sans nom';
    const v = agg.get(cle) || { q: 0, $: 0, poste: m.poste || '' };
    v.q += m.quantite; v.$ += +m.montant || 0;
    if (m.poste) v.poste = m.poste;
    agg.set(cle, v);
  });
  EMP_STATS = [...agg.entries()]
    .map(([nom, v]) => ({ nom, ...v }))
    .sort((a, b) => b.$ - a.$);
}

function filtreEmp(f) {
  EMP_FILTRE = f;
  document.querySelectorAll('#employes .filtres button').forEach(b => b.classList.toggle('actif', b.dataset.f === f));
  rendreEmployes();
}

async function rendreEmployes() {
  if (!EMP_STATS) await chargerStatsEmployes();
  const stats = new Map(EMP_STATS.map(e => [e.nom, e]));

  // Toute la table des employés, même ceux sans aucun mouvement,
  // puis les noms qui n'existent que dans le journal (ex. « Sans nom »).
  let liste = EMPLOYES.map(e => {
    const s = stats.get(e.nom);
    stats.delete(e.nom);
    return { id: e.id, nom: e.nom, poste: e.poste || (s ? s.poste : ''),
             actif: e.actif !== false, q: s ? s.q : 0, $: s ? s.$ : 0 };
  });
  stats.forEach((s, nom) => liste.push({ id: null, nom, poste: s.poste, actif: true, q: s.q, $: s.$ }));

  if (EMP_FILTRE === 'ACTIFS')   liste = liste.filter(e => e.actif);
  if (EMP_FILTRE === 'INACTIFS') liste = liste.filter(e => !e.actif);

  const q = normaliser(document.getElementById('e-recherche').value.trim());
  if (q) liste = liste.filter(e => normaliser(e.nom).includes(q));

  // coût décroissant, puis alphabétique pour ceux à zéro
  liste.sort((a, b) => (b.$ - a.$) || a.nom.localeCompare(b.nom, 'fr'));
  EMP_LISTE = liste;

  const total = liste.reduce((s, e) => s + e.$, 0);
  const sansMvt = liste.filter(e => e.q === 0).length;
  document.getElementById('e-sommaire').textContent =
    `${liste.length} personne(s) · coût total : ${dollars(total)}` +
    (sansMvt ? ` · ${sansMvt} sans mouvement` : '');

  const zone = document.getElementById('e-liste');
  if (!liste.length) { zone.innerHTML = '<div class="vide">Personne ne correspond.</div>'; return; }
  zone.innerHTML = liste.map((e, i) => `
    <div class="ligne-emp" onclick="ficheEmployeIdx(${i})">
      <div class="qui">${echap(e.nom)}${e.actif ? '' : ' <span class="pastille p-inactif">INACTIF</span>'}
        <div class="meta">${echap(e.poste || 'poste ?')}</div></div>
      <div class="pieces">${e.q} pièce(s)</div>
      <div class="cout">${dollars(e.$)}</div>
    </div>`).join('');
}

function ficheEmployeIdx(i) {
  const e = EMP_LISTE[i];
  if (e) ficheEmploye(e.nom);
}

// ---------------------------------------------------------------
// NOUVEL EMPLOYÉ : bouton dans l'onglet Employés
// Même protection anti-doublon que l'autocomplétion des sorties.
// ---------------------------------------------------------------
function ouvrirNouvelEmploye() {
  ouvrirModale(`
    <h3>Nouvel employé</h3>
    <p class="sous">Vérifiez d'abord qu'il n'existe pas déjà : la recherche ignore accents et majuscules.</p>
    <label>Nom complet</label>
    <input id="ne-nom" placeholder="Prénom Nom" autocomplete="off">
    <div class="indicateur" id="ne-alerte" style="margin-top:6px"></div>
    <label>Poste</label>
    <select id="ne-poste">
      <option value="">Choisir un poste</option>
      ${POSTES.filter(p => p.actif).map(p => `<option>${echap(p.nom)}</option>`).join('')}
    </select>
    <div class="modale-actions">
      <button class="btn-second" style="flex:1" onclick="fermerModale()">Annuler</button>
      <button class="btn-principal" style="flex:2;margin:0" id="ne-btn" onclick="creerEmploye()">Ajouter l'employé</button>
    </div>
  `);
  // avertir en direct si le nom ressemble à quelqu'un d'existant
  const champ = document.getElementById('ne-nom');
  champ.addEventListener('input', () => {
    const n = normaliser(champ.value.trim());
    const zone = document.getElementById('ne-alerte');
    if (n.length < 3) { zone.textContent = ''; return; }
    const memes = EMPLOYES.filter(e => e.actif && normaliser(e.nom) === n);
    const proches = EMPLOYES.filter(e => e.actif && normaliser(e.nom) !== n && normaliser(e.nom).includes(n)).slice(0, 3);
    if (memes.length) zone.innerHTML = '⚠ <strong>' + echap(memes[0].nom) + '</strong> existe déjà.';
    else if (proches.length) zone.textContent = 'Existants similaires : ' + proches.map(e => e.nom).join(', ');
    else zone.textContent = '';
  });
  setTimeout(() => champ.focus(), 60);
}

async function creerEmploye() {
  const nomTape = document.getElementById('ne-nom').value.trim();
  const poste = document.getElementById('ne-poste').value || null;
  if (nomTape.length < 3) { toast('Entrez le nom complet.', 'err'); return; }
  const n = normaliser(nomTape);
  const existant = EMPLOYES.find(e => normaliser(e.nom) === n);
  if (existant) {
    toast(`${existant.nom} existe déjà, aucun doublon créé.`, 'err');
    return;
  }
  const btn = document.getElementById('ne-btn');
  btn.disabled = true;
  const { data, error } = await sb.from('employes')
    .insert({ nom: nomTape, poste: poste }).select().single();
  btn.disabled = false;
  if (error) {
    toast(error.code === '23505' ? 'Ce nom existe déjà.' : 'Erreur : ' + error.message, 'err');
    return;
  }
  EMPLOYES.push(data);
  EMPLOYES.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  toast(`${data.nom} ajouté`);
  fermerModale();
  rendreEmployes();
}

async function ficheEmploye(nom, du = null, au = null) {
  if (du === '') du = null;
  if (au === '') au = null;
  const filtre = q => {
    q = q.eq('type', 'SORTIE');
    q = (nom === 'Sans nom') ? q.is('employe_nom', null) : q.eq('employe_nom', nom);
    if (du) q = q.gte('date_mouvement', du);
    if (au) q = q.lte('date_mouvement', au);
    return q;
  };
  const lignes = await toutLire('mouvements',
    'id, date_mouvement, quantite, montant, commentaire, articles(nom_complet)',
    null,
    q => filtre(q).order('date_mouvement', { ascending: false, nullsFirst: false })
                  .order('id', { ascending: false }));

  const agg = new Map();
  lignes.forEach(m => {
    const a = m.articles?.nom_complet || '?';
    const v = agg.get(a) || { q: 0, $: 0 };
    v.q += m.quantite; v.$ += +m.montant || 0;
    agg.set(a, v);
  });
  const emp = EMPLOYES.find(e => e.nom === nom) || null;
  const parArticle = [...agg.entries()].sort((x, y) => y[1].$ - x[1].$);
  const total = lignes.reduce((s, m) => s + (+m.montant || 0), 0);
  const totalQ = lignes.reduce((s, m) => s + m.quantite, 0);

  ouvrirModale(`
    <h3>${echap(nom)}</h3>
    <p class="sous">${du || au ? `Période : ${du || 'début'} → ${au || 'aujourd\'hui'} · ` : ''}${totalQ} pièce(s) · ${dollars(total)}</p>
    <table>
      <thead><tr><th>Article</th><th class="num">Qté</th><th class="num">Coût</th></tr></thead>
      <tbody>${parArticle.map(([a, v]) =>
        `<tr><td>${echap(a)}</td><td class="num">${v.q}</td><td class="num">${dollars(v.$)}</td></tr>`).join('')}
      </tbody>
    </table>
    <label style="display:block;font-size:13px;font-weight:700;margin:16px 0 6px">Dernières sorties</label>
    ${lignes.slice(0, 10).map(m => `
      <div class="journal-item">
        <div class="detail"><strong>−${m.quantite}</strong> ${echap(m.articles?.nom_complet || '?')}
          <div class="meta">${m.date_mouvement || 'sans date'}${m.commentaire ? ' · ' + echap(m.commentaire) : ''}</div>
        </div>
        <button class="suppr" title="Annuler cette saisie" onclick="supprimerMouvementEmploye(${m.id})">✕</button>
      </div>`).join('')}
    ${emp ? `
    <label style="display:block;font-size:13px;font-weight:700;margin:20px 0 6px">Modifier la fiche</label>
    <label>Nom</label>
    <input id="fe-nom" value="${echap(emp.nom)}" autocomplete="off">
    <label>Poste</label>
    <select id="fe-poste">
      <option value="">Choisir un poste</option>
      ${POSTES.filter(p => p.actif).map(p => `<option${emp.poste === p.nom ? ' selected' : ''}>${echap(p.nom)}</option>`).join('')}
    </select>
    <label style="display:flex;align-items:center;gap:8px;font-weight:400;margin-top:12px">
      <input type="checkbox" id="fe-histo" style="width:auto;margin:0">
      <span style="font-size:13px">Appliquer aussi le poste à tout son historique
        <span style="color:var(--gris)">(à cocher seulement si l'ancien poste était une erreur)</span></span>
    </label>
    <div class="modale-actions">
      <button class="btn-second" style="flex:1" onclick="fermerModale()">Fermer</button>
      <button class="btn-principal" style="flex:2;margin:0" id="fe-btn" onclick="sauverEmploye(${emp.id})">Enregistrer</button>
    </div>
    ${emp.actif === false ? `
      <button class="btn-second" style="width:100%;margin-top:12px" onclick="reactiverEmploye(${emp.id})">Réactiver cet employé</button>
    ` : `
      <button class="btn-second" style="width:100%;margin-top:12px;color:var(--rouge);border-color:var(--rouge-pale)"
        onclick="supprimerEmploye(${emp.id})">Supprimer ou désactiver cet employé</button>
    `}
    ` : `
    <div class="modale-actions">
      <button class="btn-second" style="flex:1" onclick="fermerModale()">Fermer</button>
    </div>
    `}
  `);
}

// ---------------------------------------------------------------
// MODIFIER un employé : le nom est dénormalisé dans les mouvements,
// donc un renommage doit se propager au journal.
// ---------------------------------------------------------------
async function sauverEmploye(id) {
  const emp = EMPLOYES.find(e => e.id === id);
  if (!emp) return;
  const nouveauNom = document.getElementById('fe-nom').value.trim();
  const nouveauPoste = document.getElementById('fe-poste').value || null;
  const appliquerHisto = document.getElementById('fe-histo').checked;

  if (nouveauNom.length < 3) { toast('Le nom est trop court.', 'err'); return; }
  const jumeau = EMPLOYES.find(e => e.id !== id && normaliser(e.nom) === normaliser(nouveauNom));
  if (jumeau) { toast(`${jumeau.nom} porte déjà ce nom.`, 'err'); return; }

  const btn = document.getElementById('fe-btn');
  btn.disabled = true;
  const ancienNom = emp.nom;

  const { error } = await sb.from('employes')
    .update({ nom: nouveauNom, poste: nouveauPoste }).eq('id', id);
  if (error) {
    toast(error.code === '23505' ? 'Ce nom existe déjà.' : 'Erreur : ' + error.message, 'err');
    btn.disabled = false; return;
  }

  // propager le nom au journal (employe_nom est figé sur chaque mouvement)
  if (nouveauNom !== ancienNom) {
    await sb.from('mouvements').update({ employe_nom: nouveauNom }).eq('employe_id', id);
    await sb.from('mouvements').update({ employe_nom: nouveauNom, employe_id: id }).eq('employe_nom', ancienNom);
  }
  // le poste reste figé au moment de chaque sortie, sauf demande explicite
  if (appliquerHisto && nouveauPoste) {
    await sb.from('mouvements').update({ poste: nouveauPoste }).eq('employe_id', id);
  }

  emp.nom = nouveauNom; emp.poste = nouveauPoste;
  EMPLOYES.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  EMP_STATS = null; MVT_CACHE = null;
  toast('Fiche enregistrée');
  fermerModale();
  rendreEmployes();
}

// ---------------------------------------------------------------
// SUPPRIMER : possible seulement si aucun mouvement.
// Sinon on désactive, pour ne jamais casser l'historique.
// ---------------------------------------------------------------
async function supprimerEmploye(id) {
  const emp = EMPLOYES.find(e => e.id === id);
  if (!emp) return;

  const r1 = await sb.from('mouvements').select('id', { count: 'exact', head: true }).eq('employe_id', id);
  const r2 = await sb.from('mouvements').select('id', { count: 'exact', head: true }).eq('employe_nom', emp.nom);
  const n = Math.max(r1.count || 0, r2.count || 0);

  if (n > 0) {
    if (!confirm(
      `${emp.nom} a ${n} mouvement(s) dans le journal.\n\n` +
      `Impossible de le supprimer sans effacer son historique.\n` +
      `Voulez-vous plutôt le DÉSACTIVER ? Il disparaîtra des listes de sortie, ` +
      `mais son historique et ses coûts restent intacts.`)) return;
    const { error } = await sb.from('employes').update({ actif: false }).eq('id', id);
    if (error) { toast('Erreur : ' + error.message, 'err'); return; }
    emp.actif = false;
    toast(`${emp.nom} désactivé`);
  } else {
    if (!confirm(`Supprimer définitivement ${emp.nom} ?\n\nAucun mouvement n'est rattaché à cette fiche.`)) return;
    const { error } = await sb.from('employes').delete().eq('id', id);
    if (error) { toast('Erreur : ' + error.message, 'err'); return; }
    const i = EMPLOYES.findIndex(e => e.id === id);
    if (i >= 0) EMPLOYES.splice(i, 1);
    toast(`${emp.nom} supprimé`);
  }
  EMP_STATS = null;
  fermerModale();
  rendreEmployes();
}

async function reactiverEmploye(id) {
  const emp = EMPLOYES.find(e => e.id === id);
  if (!emp) return;
  const { error } = await sb.from('employes').update({ actif: true }).eq('id', id);
  if (error) { toast('Erreur : ' + error.message, 'err'); return; }
  emp.actif = true;
  toast(`${emp.nom} réactivé`);
  fermerModale();
  rendreEmployes();
}

async function supprimerMouvementEmploye(mid) {
  if (!confirm('Annuler cette saisie ? Le stock sera recalculé.')) return;
  const { error } = await sb.from('mouvements').delete().eq('id', mid);
  if (error) { toast('Erreur : ' + error.message, 'err'); return; }
  toast('Saisie annulée');
  EMP_STATS = null;
  MVT_CACHE = null;
  fermerModale();
  rechargerStock();
  rendreEmployes();
}

// =====================================================================
// ANALYSES
// =====================================================================
async function rendreAnalyse() {
  const vue = document.getElementById('a-vue').value;
  const du = document.getElementById('a-du').value;
  const au = document.getElementById('a-au').value;

  const mvts = await toutLire('mouvements',
    'date_mouvement, type, quantite, montant, employe_nom, poste, articles(nom_complet)',
    null,
    q => { if (du) q = q.gte('date_mouvement', du); if (au) q = q.lte('date_mouvement', au); return q; });

  const sorties = mvts.filter(m => m.type === 'SORTIE');
  const agg = new Map();
  let entetes = [], lignes = [];

  if (vue === 'poste') {
    sorties.forEach(m => {
      const cle = m.poste || 'Non inscrit';
      const v = agg.get(cle) || { q: 0, $: 0 };
      v.q += m.quantite; v.$ += +m.montant || 0;
      agg.set(cle, v);
    });
    entetes = ['Poste', 'Quantité sortie', 'Coût'];
    lignes = [...agg.entries()].sort((a, b) => b[1].$ - a[1].$).map(([k, v]) => [k, v.q, v.$]);
  }
  else if (vue === 'personne') {
    sorties.forEach(m => {
      const cle = m.employe_nom || 'Sans nom';
      const v = agg.get(cle) || { q: 0, $: 0, p: m.poste || '' };
      v.q += m.quantite; v.$ += +m.montant || 0;
      if (m.poste) v.p = m.poste;
      agg.set(cle, v);
    });
    entetes = ['Personne', 'Poste', 'Quantité', 'Coût'];
    lignes = [...agg.entries()].sort((a, b) => b[1].$ - a[1].$).map(([k, v]) => [k, v.p, v.q, v.$]);
    ANALYSE_NOMS = lignes.map(l => l[0]);   // pour le clic
  }
  else if (vue === 'article') {
    sorties.forEach(m => {
      const cle = m.articles?.nom_complet || '?';
      const v = agg.get(cle) || { q: 0, $: 0 };
      v.q += m.quantite; v.$ += +m.montant || 0;
      agg.set(cle, v);
    });
    entetes = ['Article', 'Quantité sortie', 'Coût'];
    lignes = [...agg.entries()].sort((a, b) => b[1].q - a[1].q).map(([k, v]) => [k, v.q, v.$]);
  }
  else {
    mvts.forEach(m => {
      const mois = (m.date_mouvement || 'sans date').slice(0, 7);
      const v = agg.get(mois) || { aj: 0, so: 0, $: 0 };
      if (m.type === 'AJOUT') v.aj += m.quantite;
      if (m.type === 'SORTIE') { v.so += m.quantite; v.$ += +m.montant || 0; }
      agg.set(mois, v);
    });
    entetes = ['Mois', 'Reçu', 'Sorti', 'Coût des sorties'];
    lignes = [...agg.entries()].sort().map(([k, v]) => [k, v.aj, v.so, v.$]);
  }

  ANALYSE_LIGNES = [entetes, ...lignes];
  ANALYSE_META = { vue, du, au, entetes, lignes };

  const totalQ = sorties.reduce((s, m) => s + m.quantite, 0);
  const total$ = sorties.reduce((s, m) => s + (+m.montant || 0), 0);

  const cliquable = vue === 'personne';
  document.getElementById('a-table').innerHTML = `
    <div class="indicateur">Période : ${du || 'début'} → ${au || 'aujourd\'hui'} · ${sorties.length} sorties, ${totalQ} pièces, ${dollars(total$)}${cliquable ? ' · cliquez un nom pour le détail' : ''}</div>
    <table>
      <thead><tr>${entetes.map((e, i) => `<th class="${i > 0 ? 'num' : ''}">${e}</th>`).join('')}</tr></thead>
      <tbody>${lignes.map((l, li) => `<tr${cliquable ? ` class="cliquable" onclick="ficheEmploye(ANALYSE_NOMS[${li}], '${du}', '${au}')"` : ''}>${l.map((c, i) => {
        const estDollar = entetes[i].toLowerCase().includes('coût');
        return `<td class="${i > 0 ? 'num' : ''}">${estDollar ? dollars(c) : echap(c)}</td>`;
      }).join('')}</tr>`).join('')}</tbody>
    </table>`;
}

// ---------------------------------------------------------------
// MOTEUR EXCEL commun aux 4 exports (ExcelJS)
// lignes : {t:'g'} groupe, {t:'d'} donnée, {t:'s'} sous-total, {t:'T'} grand total
// ---------------------------------------------------------------
async function genererExcel({ feuille, sousTitre, entetes, colDollar, lignes, nomFichier, boutonId }) {
  const btn = boutonId ? document.getElementById(boutonId) : null;
  if (btn) btn.disabled = true;

  const BLEU = 'FF305361', OR = 'FFE8A424', GRIS = 'FFEFF2F4', GROUPE = 'FFE2E9EC';
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Salle EPI';
  const ws = wb.addWorksheet(feuille, { views: [{ showGridLines: false }] });
  const nCols = entetes.length;
  const aGroupes = lignes.some(l => l.t === 'g');

  ws.mergeCells(1, 1, 1, nCols);
  const t = ws.getCell(1, 1);
  t.value = 'Salle EPI · Canadian Royalties';
  t.font = { name: 'Calibri', size: 15, bold: true, color: { argb: BLEU } };
  ws.getRow(1).height = 24;

  ws.mergeCells(2, 1, 2, nCols);
  const st = ws.getCell(2, 1);
  st.value = sousTitre;
  st.font = { name: 'Calibri', size: 11, color: { argb: 'FF48697A' } };

  ws.mergeCells(3, 1, 3, nCols);
  ws.getRow(3).height = 4;
  for (let c = 1; c <= nCols; c++)
    ws.getCell(3, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: OR } };

  const LE = 5;
  entetes.forEach((e, i) => {
    const cel = ws.getCell(LE, i + 1);
    cel.value = e;
    cel.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLEU } };
    cel.alignment = { horizontal: colDollar[i] || typeof (lignes.find(l => l.t === 'd')?.c[i]) === 'number' ? 'right' : 'left', vertical: 'middle' };
  });
  ws.getRow(LE).height = 22;

  let zebre = 0;
  lignes.forEach((l, li) => {
    const r = LE + 1 + li;
    l.c.forEach((v, ci) => {
      const cel = ws.getCell(r, ci + 1);
      cel.value = typeof v === 'number' ? Math.round(v * 100) / 100 : v;
      cel.alignment = { horizontal: typeof v === 'number' || colDollar[ci] ? 'right' : 'left' };
      if (colDollar[ci] && v !== '' && v != null) cel.numFmt = '#,##0.00 "$"';
      if (l.t === 'g') {
        cel.font = { name: 'Calibri', size: 11, bold: true, color: { argb: BLEU } };
        cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GROUPE } };
      } else if (l.t === 's') {
        cel.font = { name: 'Calibri', size: 11, bold: true };
        cel.border = { top: { style: 'thin', color: { argb: BLEU } } };
      } else if (l.t === 'T') {
        cel.font = { name: 'Calibri', size: 11, bold: true, color: { argb: BLEU } };
        cel.border = { top: { style: 'medium', color: { argb: BLEU } } };
      } else {
        cel.font = { name: 'Calibri', size: 11 };
        if (!aGroupes && zebre % 2 === 1)
          cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS } };
      }
    });
    if (l.t === 'd') zebre++;
  });

  entetes.forEach((e, i) => {
    let max = e.length;
    lignes.forEach(l => {
      const v = l.c[i];
      const s = colDollar[i] && typeof v === 'number' ? v.toFixed(2) + ' $' : String(v ?? '');
      if (s.length > max) max = s.length;
    });
    ws.getColumn(i + 1).width = Math.min(Math.max(max + 3, 9), 55);
  });

  const rPied = LE + 1 + lignes.length + 1;
  ws.mergeCells(rPied, 1, rPied, nCols);
  const p = ws.getCell(rPied, 1);
  p.value = `Généré le ${aujourdhui()}`;
  p.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF83939D' } };

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nomFichier;
  a.click();
  URL.revokeObjectURL(a.href);
  if (btn) btn.disabled = false;
  toast('Fichier Excel téléchargé');
}

// ---------------------------------------------------------------
// EXPORT 1 : Analyses (vue courante)
// ---------------------------------------------------------------
async function exporterExcel() {
  if (!ANALYSE_META || !ANALYSE_META.lignes.length) { toast('Rien à exporter.', 'err'); return; }
  const { vue, du, au, entetes, lignes } = ANALYSE_META;
  const noms = { poste: 'Par poste', personne: 'Par personne', article: 'Par article', mois: 'Par mois' };
  const colDollar = entetes.map(e => e.toLowerCase().includes('coût'));

  const corps = lignes.map(l => ({ t: 'd', c: l }));
  const total = ['TOTAL'];
  for (let ci = 1; ci < entetes.length; ci++) {
    total.push(lignes.some(l => typeof l[ci] === 'number')
      ? lignes.reduce((s, l) => s + (typeof l[ci] === 'number' ? l[ci] : 0), 0) : '');
  }
  corps.push({ t: 'T', c: total });

  await genererExcel({
    feuille: noms[vue],
    sousTitre: `Analyse ${noms[vue].toLowerCase()} · ${du || 'Début'} au ${au || aujourdhui()}`,
    entetes, colDollar, lignes: corps,
    nomFichier: `EPI_${noms[vue].replace(' ', '_')}_${aujourdhui()}.xlsx`,
    boutonId: 'a-export'
  });
}

// ---------------------------------------------------------------
// EXPORT 2 : Historique complet des mouvements (respecte les filtres)
// ---------------------------------------------------------------
async function exporterMouvements() {
  if (!MVT_CACHE) await rendreMouvements();
  const q = normaliser(document.getElementById('m-recherche').value.trim());
  const du = document.getElementById('m-du').value;
  const au = document.getElementById('m-au').value;

  let liste = MVT_CACHE;
  if (MVT_FILTRE !== 'TOUS') liste = liste.filter(m => m.type === MVT_FILTRE);
  if (du) liste = liste.filter(m => m.date_mouvement && m.date_mouvement >= du);
  if (au) liste = liste.filter(m => m.date_mouvement && m.date_mouvement <= au);
  if (q) liste = liste.filter(m =>
    normaliser(m.articles?.nom_complet).includes(q) ||
    normaliser(m.employe_nom).includes(q) ||
    normaliser(m.poste).includes(q) ||
    normaliser(m.commentaire).includes(q));
  if (!liste.length) { toast('Rien à exporter.', 'err'); return; }

  // Archive : du plus ancien au plus récent, les sans-date à la fin
  const tri = [...liste].sort((a, b) => {
    if (!a.date_mouvement && !b.date_mouvement) return 0;
    if (!a.date_mouvement) return 1;
    if (!b.date_mouvement) return -1;
    return a.date_mouvement < b.date_mouvement ? -1 : a.date_mouvement > b.date_mouvement ? 1 : 0;
  });

  const entetes = ['Date', 'Article', 'Type', 'Quantité', 'Employé', 'Poste', 'Prix unitaire', 'Montant', 'Commentaire'];
  const colDollar = [false, false, false, false, false, false, true, true, false];

  const corps = tri.map(m => ({ t: 'd', c: [
    m.date_mouvement || 'sans date',
    m.articles?.nom_complet || '?',
    m.type,
    m.quantite,
    m.employe_nom || '',
    m.poste || '',
    m.prix_unitaire_capture != null ? +m.prix_unitaire_capture : '',
    m.type === 'SORTIE' ? +m.montant : '',
    m.commentaire || ''
  ]}));

  const totalMontant = tri.reduce((s, m) => s + (m.type === 'SORTIE' ? +m.montant || 0 : 0), 0);
  const nS = tri.filter(m => m.type === 'SORTIE').length;
  const nA = tri.filter(m => m.type === 'AJOUT').length;
  const nJ = tri.filter(m => m.type === 'AJUSTEMENT').length;
  corps.push({ t: 'T', c: ['TOTAL', `${nS} sorties · ${nA} réceptions${nJ ? ' · ' + nJ + ' ajustements' : ''}`, '', '', '', '', '', totalMontant, ''] });

  const filtres = [];
  if (MVT_FILTRE !== 'TOUS') filtres.push(MVT_FILTRE.toLowerCase() + 's');
  if (du || au) filtres.push(`${du || 'début'} au ${au || aujourdhui()}`);

  await genererExcel({
    feuille: 'Mouvements',
    sousTitre: `Historique des mouvements${filtres.length ? ' · ' + filtres.join(' · ') : ' · complet'}`,
    entetes, colDollar, lignes: corps,
    nomFichier: `EPI_Mouvements_${aujourdhui()}.xlsx`,
    boutonId: 'm-export'
  });
}

// ---------------------------------------------------------------
// EXPORT 3 : Détail par personne (groupé, avec totaux par personne)
// ---------------------------------------------------------------
async function exporterEmployes() {
  const mvts = await toutLire('mouvements',
    'employe_nom, poste, quantite, montant, articles(nom_complet)',
    null,
    q => q.eq('type', 'SORTIE'));
  if (!mvts.length) { toast('Rien à exporter.', 'err'); return; }

  // personne → article → {q, $}
  const pers = new Map();
  mvts.forEach(m => {
    const nom = m.employe_nom || 'Sans nom';
    if (!pers.has(nom)) pers.set(nom, { poste: m.poste || '', articles: new Map() });
    const p = pers.get(nom);
    if (m.poste) p.poste = m.poste;
    const art = m.articles?.nom_complet || '?';
    const v = p.articles.get(art) || { q: 0, $: 0 };
    v.q += m.quantite; v.$ += +m.montant || 0;
    p.articles.set(art, v);
  });

  const entetes = ['Personne', 'Article', 'Quantité', 'Coût'];
  const colDollar = [false, false, false, true];
  const corps = [];
  let grandQ = 0, grand$ = 0;

  [...pers.keys()].sort((a, b) => a.localeCompare(b, 'fr')).forEach(nom => {
    const p = pers.get(nom);
    corps.push({ t: 'g', c: [nom, p.poste, '', ''] });
    let sq = 0, s$ = 0;
    [...p.articles.keys()].sort((a, b) => a.localeCompare(b, 'fr')).forEach(art => {
      const v = p.articles.get(art);
      corps.push({ t: 'd', c: ['', art, v.q, v.$] });
      sq += v.q; s$ += v.$;
    });
    corps.push({ t: 's', c: [`Total ${nom}`, '', sq, s$] });
    grandQ += sq; grand$ += s$;
  });
  corps.push({ t: 'T', c: ['TOTAL GÉNÉRAL', '', grandQ, grand$] });

  await genererExcel({
    feuille: 'Par personne',
    sousTitre: `Détail des sorties par personne · ${pers.size} personne(s)`,
    entetes, colDollar, lignes: corps,
    nomFichier: `EPI_Detail_par_personne_${aujourdhui()}.xlsx`,
    boutonId: 'e-export'
  });
}

// ---------------------------------------------------------------
// EXPORT 4 : Inventaire (état du stock)
// ---------------------------------------------------------------
async function exporterInventaire() {
  const liste = ARTICLES.filter(a => a.actif)
    .sort((a, b) => a.nom_complet.localeCompare(b.nom_complet, 'fr'));
  if (!liste.length) { toast('Rien à exporter.', 'err'); return; }

  const entetes = ['Article', 'Code GUIDE TI', 'Prix unitaire', 'Seuil min', 'Stock', 'Statut', 'Valeur'];
  const colDollar = [false, false, true, false, false, false, true];
  const corps = liste.map(a => ({ t: 'd', c: [
    a.nom_complet,
    a.code_guide_ti || '',
    a.prix_unitaire != null ? +a.prix_unitaire : '',
    a.seuil_min != null ? a.seuil_min : '',
    a.stock_actuel,
    a.statut,
    +a.valeur_stock || 0
  ]}));
  const valeur = liste.reduce((s, a) => s + (+a.valeur_stock || 0), 0);
  corps.push({ t: 'T', c: ['TOTAL', '', '', '', '', '', valeur] });

  await genererExcel({
    feuille: 'Inventaire',
    sousTitre: `État du stock · ${liste.length} article(s)`,
    entetes, colDollar, lignes: corps,
    nomFichier: `EPI_Inventaire_${aujourdhui()}.xlsx`,
    boutonId: 'k-export'
  });
}
