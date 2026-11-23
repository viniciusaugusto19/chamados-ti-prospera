"use strict";
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
