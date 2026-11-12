"use strict";
/* ---------------- início ---------------- */
renderFila(); renderPainel(); renderSelectChamados();
montarSelectsAbrir();
if(load(K.wh, "")) $("statusCarga").textContent = "Webhook conectado. Abra o painel para carregar.";
$("capQuem").focus();
