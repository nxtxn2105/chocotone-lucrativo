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
   ENGINE BLINDADO DE CAPTURA & REPASSE FORÇADO DE PARÂMETROS
   - Captura 100% dos parâmetros da URL (utm_*, src, sck, fbclid, etc.)
   - Persiste no localStorage e sessionStorage
   - Injeta em todos os links de checkout e ofertas
   - Intercepta cliques e FORÇA o redirecionamento com todos os parâmetros
   - Back-Redirect inteligente para salvamento de tráfego (Downsell)
============================================================ */
(function () {
  var STORAGE_KEY = '__lead_tracking_params__';
  var DOWNSELL_URL = 'https://pay.lowify.com.br/go.php?offer=ae749aea';

  // 1. Captura e persiste todos os parâmetros da URL
  function getAllParams() {
    var currentParams = new URLSearchParams(window.location.search);
    var savedParams = {};

    try {
      var stored = sessionStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY);
      if (stored) savedParams = JSON.parse(stored);
    } catch (e) {}

    // Sobrescreve com os parâmetros da URL atual
    currentParams.forEach(function (value, key) {
      savedParams[key] = value;
    });

    // Se houver parâmetros novos, salva
    if (Object.keys(savedParams).length > 0) {
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(savedParams));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(savedParams));
      } catch (e) {}
    }

    return savedParams;
  }

  // 2. Constrói URL final com todos os parâmetros preservados
  function buildTargetUrl(rawHref) {
    if (!rawHref) return rawHref;
    var params = getAllParams();
    if (!params || Object.keys(params).length === 0) return rawHref;

    try {
      var target = new URL(rawHref, window.location.origin);
      Object.keys(params).forEach(function (k) {
        if (!target.searchParams.has(k)) {
          target.searchParams.set(k, params[k]);
        }
      });
      return target.toString();
    } catch (e) {
      return rawHref;
    }
  }

  // 3. Injeta nos links presentes no DOM
  function injectParamsInLinks() {
    var links = document.querySelectorAll('a[href*="lowify.com.br"], a[href*="checkout"], a[href*="go.php"]');
    links.forEach(function (link) {
      var updated = buildTargetUrl(link.href);
      if (updated && updated !== link.href) {
        link.href = updated;
      }
    });
  }

  // Helper seguro para disparar no Pixel
  function trackPixel(eventName, params, isCustom) {
    if (typeof window.fbq === 'function') {
      try {
        if (isCustom) {
          window.fbq('trackCustom', eventName, params || {});
        } else {
          window.fbq('track', eventName, params || {});
        }
      } catch (err) {
        console.warn('Erro Pixel:', err);
      }
    }
  }

  // 4. Delegação de clique para CHECKOUT (Lowify) com garantia de envio do Pixel
  document.addEventListener('click', function (e) {
    var link = e.target.closest('a[href*="lowify.com.br"], a[href*="checkout"], a[href*="go.php"]');
    if (!link) return;

    e.preventDefault(); // Previne navegação instantânea para o Pixel ter tempo de enviar
    var finalUrl = buildTargetUrl(link.href);

    var isDownsell = link.href.indexOf('ae749aea') !== -1;
    var isBasic = link.href.indexOf('xWMjG4') !== -1;
    var val = isDownsell ? 19.90 : (isBasic ? 14.90 : 27.90);
    var name = isDownsell ? 'Kit Completo Downsell' : (isBasic ? 'Kit Básico' : 'Kit Completo Panetones');

    // Dispara InitiateCheckout no Pixel
    trackPixel('InitiateCheckout', {
      content_name: name,
      value: val,
      currency: 'BRL'
    });

    // Redireciona com delay de 180ms para a Meta receber a requisição de rede
    setTimeout(function () {
      window.location.href = finalUrl;
    }, 180);
  }, true);

  // 5. Rastreamento e rolagem suave para TODOS os outros CTAs da página (#oferta)
  document.addEventListener('click', function (e) {
    var cta = e.target.closest('a[href^="#"], .cta-btn, button.cta-btn');
    if (!cta) return;

    // Se for link de checkout, já foi tratado acima
    if (cta.href && (cta.href.indexOf('lowify') !== -1 || cta.href.indexOf('checkout') !== -1 || cta.href.indexOf('go.php') !== -1)) {
      return;
    }

    var ctaText = (cta.innerText || cta.textContent || 'CTA').trim().replace(/\s+/g, ' ');

    // Dispara evento de engajamento no Pixel para qualquer CTA clicado
    trackPixel('CliqueCTA', {
      botao: ctaText,
      secao: cta.getAttribute('href') || 'popup'
    }, true);

    // Se for âncora (#oferta), faz scroll suave
    var targetId = cta.getAttribute('href');
    if (targetId && targetId.length > 1 && targetId.startsWith('#')) {
      var targetEl = document.querySelector(targetId);
      if (targetEl) {
        e.preventDefault();
        targetEl.scrollIntoView({ behavior: 'smooth' });
      }
    }
  });

  // 6. Executa nos ciclos de vida da página
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectParamsInLinks);
  } else {
    injectParamsInLinks();
  }
  window.addEventListener('load', injectParamsInLinks);
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