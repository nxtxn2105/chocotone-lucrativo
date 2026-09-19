/*
  script.js — VERSÃO CORRIGIDA

  PROBLEMAS RESOLVIDOS:
  ─────────────────────────────────────────────────────────────
  1. DUPLICATE PageView no FB
     ANTES: ensurePageViewFired() disparava fbq('track','PageView')
     uma segunda vez no DOMContentLoaded, causando duplicata nos
     relatórios. O Facebook NÃO deduplica PageView automaticamente.

     AGORA: Toda lógica de PageView foi removida do script.js.
     O único PageView fica no <head> do HTML. Aqui só tratamos
     InitiateCheckout, que é disparado apenas no clique.

  2. 76% de PageView via UTM (24% perdidos)
     CAUSA: appendUtmsToCheckoutLinks() rodava só no DOMContentLoaded,
     mas quando o script carregava tarde os links já existiam e o
     event listener não era adicionado. Além disso, o check
     hasUtms era feito 1x e não reaplicado.

     AGORA: A função roda no DOMContentLoaded E quando o DOM já
     está pronto. Mais importante: o InitiateCheckout é adicionado
     via delegação no document — não depende de encontrar os links
     no momento da execução.

  3. FOUC (Flash Of Unstyled Content)
     ANTES: O script adicionava body.css-loaded que controlava
     opacity. Isso causava tela em branco quando style.css demorava.

     AGORA: O CSS crítico está inline no <head>. O body começa
     visível. Removemos toda a lógica de FOUC do script.js.
  ─────────────────────────────────────────────────────────────
*/


/* ============================================================
   UTMs NOS LINKS DE CHECKOUT
   Estratégia: delegação no document + aplicação direta nos links

   Fazemos as duas coisas:
   1. Aplicamos UTMs diretamente nos links existentes (DOMContentLoaded)
   2. Delegamos o evento InitiateCheckout no document (captura qualquer
      clique em link de checkout, mesmo que o DOM mude depois)
============================================================ */
(function () {
  var utmKeys = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','src'];

  function getUtmParams() {
    var params = new URLSearchParams(window.location.search);
    var result = {};
    var hasAny = false;
    utmKeys.forEach(function (k) {
      if (params.has(k)) { result[k] = params.get(k); hasAny = true; }
    });
    return hasAny ? result : null;
  }

  function applyUtmsToLink(link, utms) {
    if (!utms || link.dataset.utmSet) return;
    link.dataset.utmSet = '1';
    try {
      var url = new URL(link.href);
      Object.keys(utms).forEach(function (k) { url.searchParams.set(k, utms[k]); });
      link.href = url.toString();
    } catch (e) {
      /* URL inválida — ignora */
    }
  }

  function applyUtmsToAllCheckoutLinks() {
    var utms = getUtmParams();
    if (!utms) return;
    document.querySelectorAll('a[href*="checkout"]').forEach(function (link) {
      applyUtmsToLink(link, utms);
    });
  }

  /*
    Delegação: InitiateCheckout dispara em qualquer clique em link
    de checkout, independente de quando o DOM montou.
    Também aplica UTMs no momento do clique como fallback final.
  */
  document.addEventListener('click', function (e) {
    var link = e.target.closest('a[href*="checkout"]');
    if (!link) return;

    /* Aplica UTMs no clique como fallback (caso não tenha aplicado antes) */
    var utms = getUtmParams();
    if (utms) applyUtmsToLink(link, utms);

    /* Dispara InitiateCheckout — apenas aqui, nunca no PageLoad */
    if (typeof fbq !== 'undefined') {
      fbq('track', 'InitiateCheckout');
    }
  }, { passive: true });

  /* Aplica UTMs nos links existentes assim que o DOM estiver pronto */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyUtmsToAllCheckoutLinks);
  } else {
    applyUtmsToAllCheckoutLinks();
  }
})();


/* ============================================================
   CONTADOR REGRESSIVO
============================================================ */
(function () {
  var KEY = 'countdown_end';
  var DURATION = 15 * 60 * 1000;

  var end;
  try { end = parseInt(localStorage.getItem(KEY)); } catch (e) { end = NaN; }

  if (!end || isNaN(end) || Date.now() >= end) {
    end = Date.now() + DURATION;
    try { localStorage.setItem(KEY, end); } catch (e) {}
  }

  var el = document.getElementById('contador');
  if (!el) return;

  function update() {
    var diff = end - Date.now();
    if (diff <= 0) {
      end = Date.now() + DURATION;
      try { localStorage.setItem(KEY, end); } catch (e) {}
      diff = DURATION;
    }
    var m = String(Math.floor(diff / 60000)).padStart(2, '0');
    var s = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
    el.textContent = '\u23F0 PROMO\u00C7\u00C3O ENCERRA EM: ' + m + ':' + s;
    setTimeout(update, 1000);
  }
  update();
})();


/* ============================================================
   POPUP
============================================================ */
(function () {
  var popup    = document.getElementById('popup');
  var btnBasic = document.getElementById('btn-basic');
  var btnClose = document.getElementById('popup-close');

  if (btnBasic && popup) {
    btnBasic.addEventListener('click', function () {
      popup.classList.add('active');
    });
  }

  if (btnClose && popup) {
    btnClose.addEventListener('click', function () {
      popup.classList.remove('active');
    });
  }

  if (popup) {
    popup.addEventListener('click', function (e) {
      if (e.target === popup) popup.classList.remove('active');
    }, { passive: true });
  }
})();


/* ============================================================
   FAQ — delegação de eventos
============================================================ */
(function () {
  var faqList = document.querySelector('.faq-list');
  if (!faqList) return;

  faqList.addEventListener('click', function (e) {
    var q = e.target.closest('.faq-q');
    if (!q) return;
    q.parentElement.classList.toggle('open');
  });
})();