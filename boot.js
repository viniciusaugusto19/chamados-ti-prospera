"use strict";
/* ---------------- início ---------------- */
montarSelectsLote();   /* antes do renderFila: a fila desenha os seletores dela */
renderFila(); renderPainel(); renderSelectChamados();
montarSelectsAbrir();
if(load(K.wh, "")) $("statusCarga").textContent = "Webhook conectado. Abra o painel para carregar.";
$("capQuem").focus();
