/**
 * checkout.js — Checkout 2 etapas com Pix (SillientPay)
 */

(function () {
  // ─── Config ────────────────────────────────────────────────────────────────
  var SILLIENT_BASE = 'https://api.sillientpay.com';
  var CLIENT_ID     = 'sp_live_bd6b696279e958b88441989386d84625';
  var CLIENT_SECRET = 'sk_1470d9d9e689c96cdbfb1b716fccc16404109e27fe2c8426dd2a5909e188d8d6';

  var _pollingTimer = null;

  // ─── Produtos ───────────────────────────────────────────────────────────────
  var PRODUCTS = {
    'btn-1mes':      { label: 'Acesso por 1 Mês',                     amount: 19.90, description: 'Acesso por 1 Mês — Rayssa Duarte' },
    'btn-vitalicio': { label: 'Acesso Vitalício 🔥',                  amount: 47.80, description: 'Acesso Vitalício — Rayssa Duarte' },
    'btn-proibido':  { label: '🔞 Proíbido + 2 Chamadas Quentes 😈', amount: 96.90, description: 'Proíbido + 2 Chamadas Quentes — Rayssa Duarte' },
  };

  // btn-combos soma todos os produtos acima dinamicamente
  function getCombosProduct() {
    var total = Object.values(PRODUCTS).reduce(function (acc, p) { return acc + p.amount; }, 0);
    return {
      label: 'Quero Todos os Combos',
      amount: Math.round(total * 100) / 100,
      description: 'Todos os Combos — Rayssa Duarte',
    };
  }

  function getProduct(id) {
    if (id === 'btn-combos') return getCombosProduct();
    return PRODUCTS[id] || null;
  }

  // ─── Debug ──────────────────────────────────────────────────────────────────
  function debug() {
    var args = Array.prototype.slice.call(arguments);
    console.log.apply(console, ['%c[Checkout]', 'color:#FF8C37;font-weight:bold'].concat(args));
  }

  // ─── Auth header ────────────────────────────────────────────────────────────
  function getAuthHeader() {
    return 'Basic ' + btoa(CLIENT_ID + ':' + CLIENT_SECRET);
  }

  // ─── Criar cobrança Pix ─────────────────────────────────────────────────────
  function createPixCharge(product, name, email, cpf, phone) {
    var payload = {
      method: 'pix',
      amount: Math.round(product.amount * 100), // centavos
      description: product.description,
      customer: {
        name: name || 'Cliente',
        email: email || 'cliente@email.com',
        document: (cpf || '00000000000').replace(/\D/g, ''),
        phone: (phone || '11999999999').replace(/\D/g, ''),
      },
      pix: { expiresInDays: 1 },
    };
    debug('Criando cobrança:', payload);
    return fetch(SILLIENT_BASE + '/api/v1/transactions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': getAuthHeader(),
      },
      body: JSON.stringify(payload),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        debug('Resposta:', res.data);
        if (!res.ok) throw new Error(JSON.stringify(res.data));
        return res.data;
      });
  }

  // ─── Consultar status ───────────────────────────────────────────────────────
  function getStatus(id) {
    return fetch(SILLIENT_BASE + '/api/v1/transactions/' + id, {
      headers: { 'Authorization': getAuthHeader() },
    })
      .then(function (r) { return r.json(); })
      .then(function (d) { debug('Status:', d); return d; });
  }

  // ─── QR Code ────────────────────────────────────────────────────────────────
  function makeQR(text) {
    var url = 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' + encodeURIComponent(text);
    return Promise.resolve(url);
  }

  // ─── Polling ────────────────────────────────────────────────────────────────
  function startPolling(txId) {
    stopPolling();
    var attempts = 0;
    _pollingTimer = setInterval(function () {
      attempts++;
      if (attempts > 60) {
        stopPolling();
        setStatus('⌛ Tempo expirado. Feche e tente novamente.', 'expired');
        return;
      }
      getStatus(txId)
        .then(function (tx) {
          if (!tx) return;
          var s = (tx.status || '').toLowerCase();
          if (s === 'pago' || s === 'paid' || s === 'completed') {
            stopPolling();
            setStatus('✅ Pagamento confirmado! Obrigado!', 'success');
            setTimeout(closeModal, 4000);
          } else if (s === 'cancelado' || s === 'cancelled' || s === 'failed' || s === 'expirado') {
            stopPolling();
            setStatus('❌ Pagamento falhou ou foi cancelado.', 'failed');
          }
        })
        .catch(function (e) { debug('Polling erro:', e); });
    }, 5000);
  }

  function stopPolling() {
    if (_pollingTimer) { clearInterval(_pollingTimer); _pollingTimer = null; }
  }

  function setStatus(msg, type) {
    var el = document.getElementById('pix-status-msg');
    if (!el) return;
    el.textContent = msg;
    el.className = 'pix-status ' + type;
  }

  // ─── Modal ──────────────────────────────────────────────────────────────────
  function closeModal() {
    stopPolling();
    var m = document.getElementById('checkout-modal');
    if (m) m.style.display = 'none';
    document.body.style.overflow = '';
  }

  function openStep1(product) {
    var m = document.getElementById('checkout-modal');
    m.querySelector('#checkout-step1').style.display = 'block';
    m.querySelector('#checkout-step2').style.display = 'none';
    m.querySelector('#checkout-product-name').textContent = product.label;
    m.querySelector('#checkout-product-price').textContent = 'R$ ' + product.amount.toFixed(2).replace('.', ',');
    m.querySelector('#checkout-error').textContent = '';
    m.querySelector('#checkout-name').value = '';
    m.querySelector('#checkout-email').value = '';
    m.querySelector('#checkout-cpf').value = '';
    m.querySelector('#checkout-phone').value = '';
    m._product = product;
    m.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  function openStep2(product, name, email, cpf, phone) {
    var m = document.getElementById('checkout-modal');
    var btnPagar = document.getElementById('btn-pagar');
    var errorEl = document.getElementById('checkout-error');

    btnPagar.disabled = true;
    btnPagar.textContent = 'Gerando Pix...';
    errorEl.textContent = '';

    createPixCharge(product, name, email, cpf, phone)
      .then(function (charge) {
        debug('Charge completo:', JSON.stringify(charge));
        var pixCode = charge.qrCode || charge.pix_code || charge.pixCode || charge.emv || charge.brcode || charge.copy_paste || '';
        if (!pixCode) throw new Error('QR Code não retornado pela API. Resposta: ' + JSON.stringify(charge));
        return makeQR(pixCode).then(function (qrUrl) {
          m.querySelector('#checkout-step1').style.display = 'none';
          m.querySelector('#checkout-step2').style.display = 'block';
          document.getElementById('pix-qrcode').src = qrUrl;
          document.getElementById('pix-copiacola').value = pixCode;
          document.getElementById('step2-product-name').textContent = product.label;
          document.getElementById('step2-product-price').textContent = 'R$ ' + product.amount.toFixed(2).replace('.', ',');
          setStatus('⏳ Aguardando pagamento...', 'pending');
          startPolling(charge.id);
        });
      })
      .catch(function (err) {
        debug('Erro:', err);
        errorEl.textContent = '❌ ' + (err.message || 'Erro ao gerar cobrança. Tente novamente.');
      })
      .finally(function () {
        btnPagar.disabled = false;
        btnPagar.textContent = 'Gerar Pix';
      });
  }

  function copyPix() {
    var input = document.getElementById('pix-copiacola');
    if (!input) return;
    navigator.clipboard.writeText(input.value).then(function () {
      var btn = document.getElementById('btn-copy-pix');
      if (btn) {
        btn.textContent = '✅ Copiado!';
        setTimeout(function () { btn.textContent = '📋 Copiar código'; }, 2000);
      }
    });
  }

  // ─── Injetar HTML ───────────────────────────────────────────────────────────
  function injectModal() {
    if (document.getElementById('checkout-modal')) return;
    var div = document.createElement('div');
    div.id = 'checkout-modal';
    div.innerHTML = [
      '<div class="co-backdrop" id="co-backdrop"></div>',
      '<div class="co-box">',

        '<div id="checkout-step1">',
          '<div class="co-header">',
            '<img src="images/logo_privacy.svg" alt="Privacy" class="co-logo">',
            '<button class="co-close" id="co-close-btn">✕</button>',
          '</div>',
          '<div class="co-product-info">',
            '<span class="co-product-label" id="checkout-product-name"></span>',
            '<span class="co-product-price" id="checkout-product-price"></span>',
          '</div>',
          '<div class="co-divider"></div>',
          '<p class="co-subtitle">Preencha seus dados para continuar</p>',
          '<div class="co-field"><label>Nome completo</label><input type="text" id="checkout-name" placeholder="Seu nome" autocomplete="name"></div>',
          '<div class="co-field"><label>E-mail</label><input type="email" id="checkout-email" placeholder="seu@email.com" autocomplete="email"></div>',
          '<input type="hidden" id="checkout-cpf" value="00000000000">',
          '<input type="hidden" id="checkout-phone" value="11999999999">',
          '<p class="co-error" id="checkout-error"></p>',
          '<button class="co-btn-primary" id="btn-pagar">Gerar Pix</button>',
          '<p class="co-secure">🔒 Pagamento 100% seguro via Pix</p>',
        '</div>',

        '<div id="checkout-step2" style="display:none">',
          '<div class="co-header">',
            '<img src="images/logo_privacy.svg" alt="Privacy" class="co-logo">',
            '<button class="co-close" id="co-close-btn2">✕</button>',
          '</div>',
          '<div class="co-product-info">',
            '<span class="co-product-label" id="step2-product-name"></span>',
            '<span class="co-product-price" id="step2-product-price"></span>',
          '</div>',
          '<div class="co-divider"></div>',
          '<p class="co-subtitle">Escaneie o QR Code ou copie o código Pix</p>',
          '<div class="co-qr-wrap"><img id="pix-qrcode" src="" alt="QR Code Pix"></div>',
          '<div class="co-copiacola-wrap">',
            '<textarea id="pix-copiacola" readonly rows="3"></textarea>',
            '<button class="co-btn-copy" id="btn-copy-pix">📋 Copiar código</button>',
          '</div>',
          '<p class="pix-status pending" id="pix-status-msg">⏳ Aguardando pagamento...</p>',
          '<p class="co-secure">🔒 Confirmação automática após o pagamento</p>',
        '</div>',

      '</div>',
    ].join('');
    document.body.appendChild(div);

    document.getElementById('co-close-btn').addEventListener('click', closeModal);
    document.getElementById('co-close-btn2').addEventListener('click', closeModal);
    document.getElementById('co-backdrop').addEventListener('click', closeModal);
    document.getElementById('btn-copy-pix').addEventListener('click', copyPix);

    document.getElementById('btn-pagar').addEventListener('click', function () {
      var m = document.getElementById('checkout-modal');
      var name  = document.getElementById('checkout-name').value.trim();
      var email = document.getElementById('checkout-email').value.trim();
      var errorEl = document.getElementById('checkout-error');
      if (!name)  { errorEl.textContent = 'Informe seu nome.'; return; }
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errorEl.textContent = 'Informe um e-mail válido.'; return; }
      openStep2(m._product, name, email, '00000000000', '11999999999');
    });
  }

  // ─── Injetar CSS ────────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('checkout-styles')) return;
    var s = document.createElement('style');
    s.id = 'checkout-styles';
    s.textContent = '\
#checkout-modal{display:none;position:fixed;inset:0;z-index:9999;align-items:center;justify-content:center;padding:1rem}\
.co-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.65)}\
.co-box{position:relative;background:#fff;border-radius:16px;width:100%;max-width:420px;padding:1.5rem;box-shadow:0 20px 60px rgba(0,0,0,.3);animation:coSlideIn .25s ease;max-height:90vh;overflow-y:auto}\
@keyframes coSlideIn{from{transform:translateY(30px);opacity:0}to{transform:translateY(0);opacity:1}}\
.co-header{display:flex;align-items:center;justify-content:center;position:relative;margin-bottom:1rem}\
.co-logo{height:32px;width:auto}\
.co-close{position:absolute;right:0;top:50%;transform:translateY(-50%);background:#F8F9FA;border:none;border-radius:50%;width:32px;height:32px;font-size:14px;cursor:pointer;color:#6C757D;display:flex;align-items:center;justify-content:center}\
.co-close:hover{background:#e2e2e2}\
.co-product-info{display:flex;align-items:center;justify-content:space-between;background:#FFE8D6;border-radius:10px;padding:.75rem 1rem;margin-bottom:.75rem}\
.co-product-label{font-size:.9rem;font-weight:600;color:#212529}\
.co-product-price{font-size:1.1rem;font-weight:700;color:#FF8C37}\
.co-divider{height:1px;background:#e5e7eb;margin:.75rem 0}\
.co-subtitle{font-size:.85rem;color:#6C757D;margin-bottom:1rem;text-align:center}\
.co-field{margin-bottom:.85rem}\
.co-field label{display:block;font-size:.8rem;font-weight:600;color:#212529;margin-bottom:.3rem}\
.co-field input{width:100%;padding:.65rem .9rem;border:1.5px solid #e5e7eb;border-radius:8px;font-size:.95rem;outline:none;transition:border-color .2s;box-sizing:border-box}\
.co-field input:focus{border-color:#FF8C37}\
.co-error{color:#FF0000;font-size:.8rem;min-height:1.2em;margin-bottom:.5rem}\
.co-btn-primary{width:100%;padding:.85rem;background:linear-gradient(135deg,#FF8C37,#ff6a00);color:#fff;border:none;border-radius:10px;font-size:1rem;font-weight:700;cursor:pointer;transition:opacity .2s,transform .2s;margin-bottom:.5rem}\
.co-btn-primary:hover:not(:disabled){opacity:.9;transform:translateY(-1px)}\
.co-btn-primary:disabled{opacity:.6;cursor:not-allowed}\
.co-secure{text-align:center;font-size:.75rem;color:#6C757D;margin-top:.25rem}\
.co-qr-wrap{display:flex;justify-content:center;margin:.75rem 0}\
.co-qr-wrap img{width:200px;height:200px;border:3px solid #FFE8D6;border-radius:12px;padding:6px}\
.co-copiacola-wrap{display:flex;flex-direction:column;gap:.5rem;margin-bottom:.75rem}\
.co-copiacola-wrap textarea{width:100%;padding:.6rem;border:1.5px solid #e5e7eb;border-radius:8px;font-size:.72rem;color:#212529;resize:none;background:#F8F9FA;box-sizing:border-box}\
.co-btn-copy{width:100%;padding:.7rem;background:#212529;color:#fff;border:none;border-radius:8px;font-size:.9rem;font-weight:600;cursor:pointer;transition:background .2s}\
.co-btn-copy:hover{background:#000}\
.pix-status{text-align:center;font-size:.85rem;font-weight:600;padding:.5rem;border-radius:8px;margin-bottom:.5rem}\
.pix-status.pending{background:#fff8e1;color:#b45309}\
.pix-status.success{background:#d1fae5;color:#065f46}\
.pix-status.failed{background:#fee2e2;color:#991b1b}\
.pix-status.expired{background:#f3f4f6;color:#6C757D}\
    ';
    document.head.appendChild(s);
  }

  // ─── Bind botões ────────────────────────────────────────────────────────────
  function bindButtons() {
    document.querySelectorAll('[data-checkout-id]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-checkout-id');
        var product = getProduct(id);
        if (!product) { debug('Produto não encontrado:', id); return; }
        debug('Abrindo checkout para:', product.label, '— R$', product.amount.toFixed(2));
        openStep1(product);
      });
    });
  }

  // ─── Init ───────────────────────────────────────────────────────────────────
  function init() {
    injectStyles();
    injectModal();
    bindButtons();
    debug('Checkout pronto ✓');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
