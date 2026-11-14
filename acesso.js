"use strict";
/* ---------------- acesso: entrar, cadastro de usuários ----------------
   Só é carregado quando o config.js aponta um servidor de acesso (SERVIDOR).
   Com ele, a página deixa de funcionar com o webhook guardado no navegador:

   - para usar, a pessoa entra com e-mail e senha;
   - o webhook do Bitrix de cada um fica guardado no servidor, e é o servidor
     que fala com o Bitrix, depois de conferir quem está pedindo;
   - quem administra cria os usuários aqui mesmo, na aba Usuários.

   A senha é conferida no servidor, nunca aqui. O que esta página guarda é só a
   sessão (a chave que o servidor entrega depois do login).

   Em K.wh fica a palavra "servidor" quando a pessoa tem webhook cadastrado lá:
   é o que o resto da página consulta para saber se dá para falar com o Bitrix. */

K.sessao = "ctip.sessao";
K.whAntigo = "ctip.whAntigo";
var AC_NO_SERVIDOR = "servidor";
var AC_SENHA_MIN = 10;
var acSessao = load(K.sessao, null);   /* {acesso, renova, expira, email} */
var acEu = null;                       /* o que o servidor diz de quem entrou */
var acRenovando = null;
var acModo = "";

function acBase(){ return String(SERVIDOR.url).replace(/\/+$/, ""); }

/* ---------------- sessão ---------------- */
function acGuardar(j, email){
  acSessao = {acesso: j.access_token, renova: j.refresh_token,
              expira: Date.now() + (Number(j.expires_in) || 3600) * 1000,
              email: email || (j.user && j.user.email) || (acSessao && acSessao.email) || ""};
  save(K.sessao, acSessao);
}
function acLogin(caminho, corpo){
  return fetch(acBase() + "/auth/v1/" + caminho, {
    method: "POST", headers: {"apikey": SERVIDOR.chave, "Content-Type": "application/json"},
    body: JSON.stringify(corpo)
  }).then(function(r){
    return r.json().then(function(j){ return {ok: r.ok, st: r.status, j: j}; }, function(){ return {ok: false, st: r.status, j: {}}; });
  });
}
/* a chave de acesso vence em uma hora; renova pouco antes, uma vez só por vez */
function acToken(){
  if(!acSessao) return Promise.reject(new Error("entre de novo"));
  if(acSessao.expira - Date.now() > 60000) return Promise.resolve(acSessao.acesso);
  if(!acRenovando){
    acRenovando = acLogin("token?grant_type=refresh_token", {refresh_token: acSessao.renova}).then(function(res){
      acRenovando = null;
      if(!res.ok || !res.j.access_token){ acEncerrar("Sua sessão venceu. Entre de novo."); throw new Error("entre de novo"); }
      acGuardar(res.j);
      return acSessao.acesso;
    }, function(e){ acRenovando = null; throw e; });
  }
  return acRenovando;
}
/* todo pedido ao servidor passa por aqui */
function acPedir(corpo){
  return acToken().then(function(token){
    return fetch(acBase() + "/functions/v1/chamados", {
      method: "POST",
      headers: {"apikey": SERVIDOR.chave, "Authorization": "Bearer " + token, "Content-Type": "application/json"},
      body: JSON.stringify(corpo)
    });
  }).then(function(r){
    return r.json().then(function(j){ return {st: r.status, j: j || {}}; }, function(){ return {st: r.status, j: {}}; });
  }).then(function(res){
    if(res.st === 401){ acEncerrar("Sua sessão venceu. Entre de novo."); throw new Error("entre de novo"); }
    if(res.st >= 400){
      var e = new Error(res.j.erro || ("o servidor respondeu " + res.st));
      e.status = res.st;
      throw e;
    }
    return res.j;
  });
}
/* é por aqui que o bitrix.js fala com o Bitrix quando há servidor */
function acessoBitrix(metodo, params){
  return acPedir({acao: "bitrix", metodo: metodo, params: params || {}});
}

/* sair: some a sessão e tudo o que foi lido do Bitrix neste navegador */
function acLimpar(){
  acSessao = null; acEu = null;
  try{
    [K.sessao, K.wh, K.chamados, K.eu, K.usuarios].forEach(function(k){ localStorage.removeItem(k); });
  }catch(e){ /* segue */ }
}
function acEncerrar(motivo){
  acLimpar();
  acTela("entrar", motivo || "");
}
function acSair(){
  var s = acSessao;
  if(s) fetch(acBase() + "/auth/v1/logout", {method: "POST",
    headers: {"apikey": SERVIDOR.chave, "Authorization": "Bearer " + s.acesso}}).catch(function(){});
  acLimpar();
  location.reload();
}

/* ---------------- telas: entrar, trocar senha, conta ---------------- */
(function(){
  var st = document.createElement("style");
  st.textContent =
    "#acTela{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;" +
      "padding:20px;background:var(--bg);overflow:auto}" +
    "#acTela[hidden]{display:none}" +
    "#acTela.leve{background:rgba(0,0,0,.6)}" +
    "#acTela .card{width:100%;max-width:400px;margin:0}" +
    "#acTela .field{margin-top:12px}" +
    "#acMsg{min-height:1.2em;margin-top:12px;font-size:.85rem;color:var(--crit)}" +
    "body.ac-fechado > header, body.ac-fechado > main{display:none}" +
    "#acSenhaNova{font-family:var(--mono);font-size:1.05rem;letter-spacing:.04em;user-select:all}";
  document.head.appendChild(st);
  var d = document.createElement("div");
  d.id = "acTela"; d.hidden = true;
  d.innerHTML = '<form class="card" id="acForm" autocomplete="on">' +
    '<h3 id="acTitulo"></h3><div class="hint" id="acSub" style="margin:0"></div>' +
    '<div class="field" id="acCampoEmail"><label for="acEmail">E-mail</label>' +
      '<input type="email" id="acEmail" autocomplete="username"></div>' +
    '<div class="field" id="acCampoSenha"><label for="acSenha">Senha</label>' +
      '<input type="password" id="acSenha" autocomplete="current-password"></div>' +
    '<div class="field" id="acCampoNova"><label for="acNova">Nova senha</label>' +
      '<input type="password" id="acNova" autocomplete="new-password">' +
      '<div class="hint">Pelo menos ' + AC_SENHA_MIN + ' caracteres. Uma frase curta vale mais que símbolos.</div></div>' +
    '<div class="field" id="acCampoNova2"><label for="acNova2">Repita a nova senha</label>' +
      '<input type="password" id="acNova2" autocomplete="new-password"></div>' +
    '<div id="acMsg" role="alert"></div>' +
    '<div class="row-end">' +
      '<button class="ghost" type="button" id="acFechar">Fechar</button>' +
      '<button class="ghost" type="button" id="acBtnSair">Sair</button>' +
      '<button class="ghost" type="button" id="acBtnTrocar">Trocar senha</button>' +
      '<button class="primary" type="submit" id="acOk"></button>' +
    "</div></form>";
  document.body.appendChild(d);
})();

function acTela(modo, msg){
  acModo = modo;
  var t = $("acTela");
  var mostra = function(id, sim){ $(id).hidden = !sim; };
  var fechada = modo === "entrar" || modo === "obrigatoria";
  t.hidden = !modo;
  t.className = fechada ? "" : "leve";
  document.body.classList.toggle("ac-fechado", fechada);
  document.body.style.visibility = "";
  if(!modo) return;
  mostra("acCampoEmail", modo === "entrar"); mostra("acCampoSenha", modo === "entrar");
  mostra("acCampoNova", modo === "obrigatoria" || modo === "trocar");
  mostra("acCampoNova2", modo === "obrigatoria" || modo === "trocar");
  mostra("acFechar", modo === "conta" || modo === "trocar");
  mostra("acBtnSair", modo === "conta" || modo === "obrigatoria");
  mostra("acBtnTrocar", modo === "conta");
  mostra("acOk", modo !== "conta");
  $("acTitulo").textContent = {entrar: "Chamados TI", obrigatoria: "Defina a sua senha",
                               trocar: "Trocar senha", conta: "Sua conta"}[modo];
  $("acSub").textContent = {
    entrar: "Entre com o e-mail e a senha que a TI cadastrou para você.",
    obrigatoria: "Você entrou com a senha provisória. Escolha a sua para continuar.",
    trocar: "A nova senha vale a partir do próximo acesso.",
    conta: acEu ? acEu.nome + " · " + acEu.email + " · " + (acEu.papel === "admin" ? "administrador" : "atendente") +
                  (acEu.tem_webhook ? " · Bitrix: " + (acEu.bitrix_nome || "ligado") : " · Bitrix ainda não ligado") : ""
  }[modo];
  $("acOk").textContent = modo === "entrar" ? "Entrar" : "Salvar senha";
  $("acMsg").textContent = msg || "";
  $("acSenha").value = ""; $("acNova").value = ""; $("acNova2").value = "";
  var foco = modo === "entrar" ? ($("acEmail").value ? "acSenha" : "acEmail") : (modo === "conta" ? "acFechar" : "acNova");
  $(foco).focus();
}
function acOcupado(sim){ $("acOk").disabled = sim; }

function acEntrar(){
  var email = $("acEmail").value.trim(), senha = $("acSenha").value;
  if(!email || !senha){ $("acMsg").textContent = "Preencha o e-mail e a senha."; return; }
  acOcupado(true);
  acLogin("token?grant_type=password", {email: email, password: senha}).then(function(res){
    if(!res.ok || !res.j.access_token){
      acOcupado(false);
      $("acMsg").textContent = res.st === 429 ? "Muitas tentativas seguidas. Espere um minuto e tente de novo."
                                              : "E-mail ou senha não conferem.";
      $("acSenha").value = ""; $("acSenha").focus();
      return;
    }
    acGuardar(res.j, email);
    return acChegar().then(function(){ acOcupado(false); });
  }, function(){
    acOcupado(false);
    $("acMsg").textContent = "Não consegui falar com o servidor de acesso. Confira a internet e tente de novo.";
  });
}
function acTrocar(){
  var a = $("acNova").value, b = $("acNova2").value;
  if(a.length < AC_SENHA_MIN){ $("acMsg").textContent = "A senha precisa de pelo menos " + AC_SENHA_MIN + " caracteres."; return; }
  if(a !== b){ $("acMsg").textContent = "As duas senhas não são iguais."; return; }
  var obrigatoria = acModo === "obrigatoria";
  acOcupado(true);
  acPedir({acao: "senha.trocar", nova: a}).then(function(){
    acOcupado(false);
    if(acEu) acEu.trocar_senha = false;
    toast("Senha trocada.");
    if(obrigatoria) acChegar(); else acTela("");
  }, function(e){
    acOcupado(false);
    if(acSessao) $("acMsg").textContent = e.message;
  });
}
$("acForm").addEventListener("submit", function(e){
  e.preventDefault();
  if(acModo === "entrar") acEntrar(); else if(acModo === "obrigatoria" || acModo === "trocar") acTrocar();
});
$("acFechar").addEventListener("click", function(){ acTela(""); });
$("acBtnSair").addEventListener("click", acSair);
$("acBtnTrocar").addEventListener("click", function(){ acTela("trocar"); });

/* ---------------- depois de entrar ---------------- */
function acMarcarBitrix(){
  var tem = !!(acEu && acEu.tem_webhook);
  save(K.wh, tem ? AC_NO_SERVIDOR : "");
  /* webhook que este navegador guardava antes de existir login: não vai sozinho
     para o servidor, porque num computador dividido ele pode ser de outra
     pessoa. Fica no campo, e quem decide é quem está na frente da tela. */
  var antigo = tem ? "" : load(K.whAntigo, "");
  $("wh").value = antigo;
  if(antigo) $("diag").textContent = "Este navegador guardava um webhook de antes do login. Se ele é SEU, clique em " +
    "Testar conexão para guardá-lo no servidor. Se é de outra pessoa, clique em Esquecer e cole o seu.";
  if(typeof marcarConn === "function") marcarConn(tem);
  $("statusCarga").textContent = tem ? "Bitrix ligado. Clique em Carregar do Bitrix."
    : "Falta ligar o seu Bitrix: cole o seu webhook na aba Bitrix, uma vez.";
}
function acChegar(){
  return acPedir({acao: "eu"}).then(function(eu){
    acEu = eu;
    if(eu.trocar_senha){ acTela("obrigatoria"); return; }
    acTela("");
    acPintarConta();
    acMarcarBitrix();
  }, function(e){
    if(!acSessao) return;                       /* já voltou para a tela de entrar */
    if(e.status === 403){ acEncerrar(e.message); return; }
    /* sem rede: a sessão guardada vale para abrir a página e usar a Captura */
    acTela("");
    acPintarConta();
  });
}

/* ---------------- cabeçalho e aba Bitrix ---------------- */
function acPintarConta(){
  var b = $("acConta");
  if(!b){
    b = document.createElement("button");
    b.className = "ghost"; b.id = "acConta"; b.type = "button";
    $("btnTema").parentNode.insertBefore(b, $("btnTema"));
    b.addEventListener("click", function(){ acTela("conta"); });
  }
  var nome = (acEu && acEu.nome) || (acSessao && acSessao.email) || "Conta";
  b.textContent = String(nome).split(" ")[0];
  b.title = "Sua conta: trocar senha ou sair";
  acPintarAbaUsuarios();
}
/* na aba Bitrix, o campo do webhook passa a mandar para o servidor. O clique é
   interceptado antes de chegar ao código antigo, que guardaria a URL aqui. */
document.addEventListener("click", function(e){
  var b = e.target && e.target.closest ? e.target.closest("#btnTestar, #btnEsquecer") : null;
  if(!b) return;
  e.stopPropagation(); e.preventDefault();
  var d = $("diag");
  if(b.id === "btnEsquecer"){
    acPedir({acao: "webhook.esquecer"}).then(function(){
      try{ localStorage.removeItem(K.whAntigo); }catch(x){ /* segue */ }
      if(acEu) acEu.tem_webhook = false;
      acMarcarBitrix();
      d.textContent = "Webhook apagado do servidor.";
    }, function(err){ d.textContent = "Não consegui apagar: " + err.message; });
    return;
  }
  var url = $("wh").value.trim().replace(/\/+$/, "");
  if(!url){
    d.textContent = acEu && acEu.tem_webhook
      ? "Seu Bitrix já está ligado" + (acEu.bitrix_nome ? " como " + acEu.bitrix_nome : "") +
        ". Para trocar, cole outro webhook aqui."
      : "Cole a URL do seu webhook primeiro.";
    return;
  }
  d.textContent = "Mandando para o servidor, que testa no Bitrix…";
  b.disabled = true;
  acPedir({acao: "webhook.definir", url: url}).then(function(r){
    b.disabled = false;
    try{ localStorage.removeItem(K.whAntigo); }catch(x){ /* segue */ }
    if(acEu){ acEu.tem_webhook = true; acEu.bitrix_nome = r.bitrix_nome; }
    acMarcarBitrix();
    d.textContent = "Guardado no servidor. Bitrix ligado como " + r.bitrix_nome + ".\n" +
      "A URL não ficou neste navegador, e o campo acima foi limpo de propósito.";
  }, function(err){
    b.disabled = false;
    d.textContent = "Não foi aceito: " + err.message;
  });
}, true);
(function(){
  var dica = document.querySelector("#tab-conexao .field .hint");
  if(dica) dica.innerHTML = "No Bitrix: <b>Aplicativos → Webhooks → Webhook de entrada</b>, com permissão de <b>CRM</b>, " +
    "<b>Usuários (user)</b> e <b>Tarefas (task)</b>. Cole aqui uma vez: a URL vai para o servidor de acesso, fica " +
    "ligada ao seu usuário e <b>não é guardada neste navegador</b>. Cada pessoa cola o próprio webhook.";
})();

/* ---------------- aba Usuários (só administrador) ---------------- */
function acPintarAbaUsuarios(){
  var admin = !!(acEu && acEu.papel === "admin");
  var bt = $("acAbaUsuarios");
  if(!admin){
    if(bt){ bt.hidden = true; $("tab-usuarios").hidden = true; }
    return;
  }
  if(bt){ bt.hidden = false; return; }
  var nav = document.querySelector("nav.tabs");
  bt = document.createElement("button");
  bt.id = "acAbaUsuarios"; bt.setAttribute("role", "tab"); bt.setAttribute("aria-selected", "false");
  bt.textContent = "Usuários";
  nav.appendChild(bt);
  var sec = document.createElement("section");
  sec.id = "tab-usuarios"; sec.hidden = true;
  sec.innerHTML = "<h2>Usuários</h2>" +
    '<p class="lead">Quem pode entrar no Chamados TI. Não há cadastro aberto: só entra quem for criado aqui.</p>' +
    '<div class="card"><h3>Novo usuário</h3><div class="grid g3">' +
      '<div class="field"><label for="acNovoNome">Nome</label><input type="text" id="acNovoNome" maxlength="80" autocomplete="off"></div>' +
      '<div class="field"><label for="acNovoEmail">E-mail</label><input type="email" id="acNovoEmail" autocomplete="off"></div>' +
      '<div class="field"><label for="acNovoPapel">Papel</label><select id="acNovoPapel">' +
        '<option value="atendente">Atendente</option><option value="admin">Administrador</option></select></div>' +
    '</div><div class="row-end"><span class="hint" id="acNovoAviso" style="flex:1;margin:0"></span>' +
      '<button class="primary" id="acNovoCriar" type="button">Criar usuário</button></div>' +
    '<div class="aviso" id="acSenhaCaixa" hidden></div>' +
    '<div class="hint">Atendente usa o programa inteiro. Administrador também cria e desativa usuários. ' +
      "A senha provisória aparece uma vez só; no primeiro acesso a pessoa é obrigada a trocar.</div></div>" +
    '<div class="tablewrap"><table><thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Bitrix</th>' +
      "<th>Situação</th><th></th></tr></thead><tbody id=\"acLista\"></tbody></table></div>" +
    '<div class="card" style="margin-top:16px"><h3>Registro</h3>' +
      '<div class="hint" style="margin:0 0 10px">Cadastros, trocas de senha e tudo o que gravou no Bitrix por aqui. ' +
      'As 100 linhas mais recentes.</div><button class="ghost" id="acVerRegistro" type="button">Ver registro</button>' +
      '<ul class="hist" id="acRegistro" style="margin-top:12px"></ul></div>';
  document.querySelector("main").appendChild(sec);

  /* as outras abas não conhecem esta: ao clicar nelas, esta se esconde */
  Array.prototype.forEach.call(nav.querySelectorAll("button"), function(o){
    if(o === bt) return;
    o.addEventListener("click", function(){ bt.setAttribute("aria-selected", "false"); sec.hidden = true; });
  });
  bt.addEventListener("click", function(){
    Array.prototype.forEach.call(nav.querySelectorAll("button"), function(o){
      o.setAttribute("aria-selected", o === bt ? "true" : "false");
      var s = $("tab-" + o.dataset.tab); if(s) s.hidden = true;
    });
    sec.hidden = false;
    acListarUsuarios();
  });
  $("acNovoCriar").addEventListener("click", acCriarUsuario);
  $("acLista").addEventListener("click", acAcaoNaLista);
  $("acLista").addEventListener("change", acAcaoNaLista);
  $("acVerRegistro").addEventListener("click", function(){
    acPedir({acao: "registro.listar"}).then(function(r){
      $("acRegistro").innerHTML = (r.linhas || []).map(function(l){
        return "<li><b>" + esc(dataHora(l.em)) + "</b> · " + esc(l.email) + " · " + esc(l.acao) +
               (l.detalhe ? " · " + esc(l.detalhe) : "") + "</li>";
      }).join("") || "<li>Nada registrado ainda.</li>";
    }, function(e){ toast(e.message); });
  });
}
function acMostrarSenha(nome, senha){
  var c = $("acSenhaCaixa");
  c.hidden = false;
  c.innerHTML = "Senha provisória de <b>" + esc(nome) + '</b>: <span id="acSenhaNova">' + esc(senha) + "</span> " +
    '<button class="mini" type="button" id="acSenhaCopiar">copiar</button> <button class="mini" type="button" id="acSenhaOk">já entreguei</button>' +
    '<div class="hint">Só aparece agora. Entregue pessoalmente ou por ligação; no primeiro acesso a página pede uma senha nova.</div>';
  $("acSenhaCopiar").addEventListener("click", function(){
    if(navigator.clipboard && navigator.clipboard.writeText)
      navigator.clipboard.writeText(senha).then(function(){ toast("Senha copiada."); }, function(){ fallbackCopy(senha); });
    else fallbackCopy(senha);
  });
  $("acSenhaOk").addEventListener("click", function(){ c.hidden = true; c.innerHTML = ""; });
}
function acCriarUsuario(){
  var nome = $("acNovoNome").value.trim(), email = $("acNovoEmail").value.trim();
  if(!nome || !email){ $("acNovoAviso").textContent = "Preencha o nome e o e-mail."; return; }
  $("acNovoCriar").disabled = true; $("acNovoAviso").textContent = "Criando…";
  acPedir({acao: "usuarios.criar", nome: nome, email: email, papel: $("acNovoPapel").value}).then(function(r){
    $("acNovoCriar").disabled = false; $("acNovoAviso").textContent = "";
    $("acNovoNome").value = ""; $("acNovoEmail").value = "";
    acMostrarSenha(nome, r.senha_provisoria);
    acListarUsuarios();
  }, function(e){
    $("acNovoCriar").disabled = false; $("acNovoAviso").textContent = e.message;
  });
}
function acListarUsuarios(){
  acPedir({acao: "usuarios.listar"}).then(function(r){
    $("acLista").innerHTML = (r.usuarios || []).map(function(u){
      var eu = acEu && u.email === acEu.email;
      var sit = !u.ativo ? '<span class="tag neutral">desativado</span>'
        : (u.trocar_senha ? '<span class="tag warn">senha provisória</span>' : '<span class="tag ok">ativo</span>');
      return '<tr data-id="' + esc(u.id) + '" data-nome="' + esc(u.nome || u.email) + '">' +
        "<td>" + esc(u.nome || "—") + (eu ? ' <span class="tag neutral">você</span>' : "") + "</td>" +
        "<td>" + esc(u.email) + "</td>" +
        '<td><select data-papel aria-label="Papel">' +
          '<option value="atendente"' + (u.papel === "atendente" ? " selected" : "") + ">Atendente</option>" +
          '<option value="admin"' + (u.papel === "admin" ? " selected" : "") + ">Administrador</option></select></td>" +
        "<td>" + (u.bitrix ? esc(u.bitrix) : '<span style="color:var(--muted)">não ligou</span>') + "</td>" +
        "<td>" + sit + "</td>" +
        '<td style="text-align:right;white-space:nowrap">' +
          '<button class="mini" type="button" data-senha>nova senha</button> ' +
          '<button class="mini' + (u.ativo ? " danger" : "") + '" type="button" data-ativo="' + (u.ativo ? "0" : "1") + '">' +
            (u.ativo ? "desativar" : "reativar") + "</button></td></tr>";
    }).join("");
  }, function(e){
    toast(e.message);
    if(e.status === 403) acChegar();     /* deixou de ser administrador: a aba some */
  });
}
function acAcaoNaLista(e){
  var tr = e.target.closest ? e.target.closest("tr") : null;
  if(!tr) return;
  var id = tr.dataset.id, nome = tr.dataset.nome, t = e.target, pedido = null;
  if(e.type === "change" && t.hasAttribute("data-papel")) pedido = {acao: "usuarios.mudar", id: id, papel: t.value};
  if(e.type === "click" && t.hasAttribute("data-ativo")){
    /* dois toques para desativar: tira o acesso e apaga o webhook guardado da pessoa */
    if(t.dataset.ativo === "0" && t.dataset.confirma !== "1"){
      t.dataset.confirma = "1"; t.textContent = "confirmar";
      setTimeout(function(){ t.dataset.confirma = ""; t.textContent = "desativar"; }, 4000);
      return;
    }
    pedido = {acao: "usuarios.mudar", id: id, ativo: t.dataset.ativo === "1"};
  }
  if(e.type === "click" && t.hasAttribute("data-senha")){
    if(t.dataset.confirma !== "1"){
      t.dataset.confirma = "1"; t.textContent = "confirmar";
      setTimeout(function(){ t.dataset.confirma = ""; t.textContent = "nova senha"; }, 4000);
      return;
    }
    acPedir({acao: "usuarios.senha", id: id}).then(function(r){
      acMostrarSenha(nome, r.senha_provisoria); acListarUsuarios();
    }, function(err){ toast(err.message); });
    return;
  }
  if(!pedido) return;
  acPedir(pedido).then(acListarUsuarios, function(err){ toast(err.message); acListarUsuarios(); });
}

/* ---------------- início ---------------- */
(function(){
  var w = load(K.wh, "");
  if(/^https:\/\//.test(w)){ save(K.whAntigo, w); save(K.wh, ""); }
})();
if(acSessao && acSessao.acesso){
  /* abre já, para a página servir sem rede; o servidor confirma em seguida */
  acTela("");
  acPintarConta();
  acChegar();
} else {
  acTela("entrar");
}
