"use strict";
/* v36: tema renovado (fonte, ícones, menu lateral, tela larga) por cima do
   estilo.css; tirar estas linhas volta ao visual anterior (ver tema.css) */
(function(){
  var l = document.createElement("link");
  l.rel = "stylesheet"; l.href = "tema.css";
  document.head.appendChild(l);
  /* menu lateral recolhido em ícones, lembrado neste navegador */
  var curto = load("ctip.menu", "") === "curto";
  if(curto) document.documentElement.setAttribute("data-menu", "curto");
  var bt = document.createElement("button");
  bt.className = "ghost"; bt.id = "btnMenu"; bt.type = "button";
  var pinta = function(){
    var c = document.documentElement.getAttribute("data-menu") === "curto";
    bt.textContent = c ? "Expandir menu" : "Recolher menu";
    bt.title = c ? "Mostrar os nomes das abas" : "Deixar só os ícones e ganhar espaço";
  };
  pinta();
  $("btnTema").parentNode.insertBefore(bt, $("btnTema"));
  bt.addEventListener("click", function(){
    var c = document.documentElement.getAttribute("data-menu") === "curto";
    if(c) document.documentElement.removeAttribute("data-menu"); else document.documentElement.setAttribute("data-menu", "curto");
    save("ctip.menu", c ? "" : "curto"); pinta();
  });
  /* no menu recolhido, o nome da aba aparece ao passar o mouse */
  Array.prototype.forEach.call(document.querySelectorAll("nav.tabs button"), function(b){ if(!b.title) b.title = b.textContent.replace(/\d+$/, "").trim(); });
})();

/* ---------------- início ---------------- */
montarSelectsLote();   /* antes do renderFila: a fila desenha os seletores dela */
montarSelectsAplicar();
renderFila(); renderPainel(); renderSelectChamados();
montarSelectsAbrir();
if(load(K.wh, "")) $("statusCarga").textContent = "Webhook conectado. Abra o painel para carregar.";
$("capQuem").focus();

/* partes que se penduram na página depois do início: favoritos, cópia de
   segurança, meu desempenho (ver extras.js) */
(function(){
  var s = document.createElement("script");
  s.src = "extras.js";
  document.body.appendChild(s);
})();

/* inventário de TI: equipamentos na ficha, aba Parque, QR da etiqueta (ver
   inventario.js). O gerador de QR (qr.js) só é lido na hora de imprimir. */
(function(){
  var s = document.createElement("script");
  s.src = "inventario.js";
  document.body.appendChild(s);
})();

/* v32: feriados, respostas prontas, relatórios, termo de responsabilidade e
   leitor de QR (ver mais.js). Espera o inventario.js sozinho. */
(function(){
  var s = document.createElement("script");
  s.src = "mais.js";
  document.body.appendChild(s);
})();

/* v33: avaliação de satisfação, histórico de equipamento, rotinas e
   vencimentos (ver servico.js). Só aparece com o servidor de acesso. */
(function(){
  var s = document.createElement("script");
  s.src = "servico.js";
  document.body.appendChild(s);
})();

/* v34: aba Parque mais limpa: ações da linha num menu, cartões que minimizam e
   a visão Kanban do inventário (ver parque.js). Espera o mais.js sozinho. */
(function(){
  var s = document.createElement("script");
  s.src = "parque.js";
  document.body.appendChild(s);
})();

/* v35: Captura com menos trabalho manual: classificação sugerida, canal
   WhatsApp, vários de uma vez e conversa recebida pelo compartilhar do celular
   (ver captura.js). Usa o app.js e o importar.js, que já carregaram. */
(function(){
  var s = document.createElement("script");
  s.src = "captura.js";
  /* v43: solicitante escolhido entre os colaboradores do Bitrix e encerrar
     voltando ao painel (ver solicitante.js). Vem depois do captura.js, que ele
     embrulha por fora. */
  s.onload = s.onerror = function(){
    var t = document.createElement("script");
    t.src = "solicitante.js";
    document.body.appendChild(t);
  };
  document.body.appendChild(s);
})();

/* com servidor de acesso configurado, a tela de entrar vem antes de tudo. A
   página fica escondida até ela decidir o que mostrar. */
if(SERVIDOR.url){
  document.body.style.visibility = "hidden";
  (function(){
    var s = document.createElement("script");
    s.src = "acesso.js";
    s.onerror = function(){
      document.body.style.visibility = "";
      toast("Não consegui carregar a tela de acesso. Confira a internet e recarregue a página.");
    };
    document.body.appendChild(s);
  })();
}
