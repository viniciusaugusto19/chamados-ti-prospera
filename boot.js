"use strict";
/* ---------------- início ---------------- */
montarSelectsLote();   /* antes do renderFila: a fila desenha os seletores dela */
montarSelectsAplicar();
renderFila(); renderPainel(); renderSelectChamados();
montarSelectsAbrir();
if(load(K.wh, "")) $("statusCarga").textContent = "Webhook conectado. Abra o painel para carregar.";
$("capQuem").focus();

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
