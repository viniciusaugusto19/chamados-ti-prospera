"use strict";
/* ---------------- modelos de chamado ----------------
   Chamado que se repete não precisa ser digitado de novo. Um modelo guarda o
   nome, a classificação, os detalhes e os próximos passos; escolher um preenche
   o formulário, e daí em diante é um chamado comum — nada é criado até o
   "Salvar chamado".

   Dois já vêm prontos, Admissão e Desligamento, porque são os que mais dão
   problema quando um passo é esquecido. São ponto de partida: ajuste a lista ao
   que vocês fazem de fato e salve com o mesmo nome, que o seu passa a valer.

   Os que vêm prontos não escolhem categoria nem prioridade: essas listas são do
   portal de vocês, e chutar um valor aqui gravaria classificação errada. Os que
   você salvar guardam a classificação que estava no formulário.

   Ficam guardados neste navegador. */

K.modelos = "ctip.modelos";
var MODELOS_PRONTOS = [
  {nome: "Admissão de colaborador", titulo: "Admissão — ",
   detalhes: "Colaborador:\nÁrea e gestor:\nData de início:\nEquipamentos a entregar:\nSistemas que vai usar:",
   passos: [
     "Criar a conta no Microsoft 365 e atribuir a licença",
     "Criar o usuário no Bitrix24 e colocar no departamento",
     "Preparar o notebook: atualizações, Intune e programas da área",
     "Separar celular e linha, se a função tiver",
     "Registrar no inventário quem ficou com cada equipamento",
     "Liberar pastas, grupos e sistemas da área",
     "Entregar os equipamentos e colher a assinatura do termo de responsabilidade",
     "Fazer o primeiro acesso junto com o colaborador"
   ]},
  {nome: "Desligamento de colaborador", titulo: "Desligamento — ",
   detalhes: "Colaborador:\nÁrea e gestor:\nÚltimo dia:\nEquipamentos a recolher:\nQuem fica com os arquivos e o e-mail:",
   passos: [
     "Bloquear o acesso no Microsoft 365 e encerrar as sessões abertas",
     "Trocar a senha e remover a autenticação em dois fatores",
     "Bloquear o usuário no Bitrix24 e passar adiante o que estava no nome dele",
     "Encaminhar o e-mail ou converter a caixa, conforme o gestor decidir",
     "Passar os arquivos do OneDrive para o gestor",
     "Revogar os acessos a sistemas da área",
     "Recolher notebook, celular, chip e acessórios, conferindo com o inventário",
     "Atualizar o inventário e liberar a licença"
   ]}
];
var modelosMeus = load(K.modelos, []);

/* um modelo seu com o mesmo nome de um pronto fica no lugar dele */
function modelosTodos(){
  var nomes = {};
  modelosMeus.forEach(function(m){ nomes[m.nome] = true; });
  return modelosMeus.map(function(m){ return {m: m, meu: true}; })
    .concat(MODELOS_PRONTOS.filter(function(m){ return !nomes[m.nome]; })
                           .map(function(m){ return {m: m, meu: false}; }));
}
function modeloPorNome(nome){
  var achado = null;
  modelosTodos().forEach(function(x){ if(x.m.nome === nome) achado = x; });
  return achado;
}
function pintarModelos(){
  var sel = $("fModelo");
  if(!sel) return;
  var atual = sel.value;
  sel.innerHTML = '<option value="">Em branco</option>';
  modelosTodos().forEach(function(x){
    sel.appendChild(new Option(x.m.nome + (x.meu ? "" : " (pronto)"), x.m.nome));
  });
  sel.value = modeloPorNome(atual) ? atual : "";
  var x = modeloPorNome(sel.value);
  $("btnModeloApagar").hidden = !(x && x.meu);
}
function aplicarModelo(nome){
  var x = modeloPorNome(nome);
  if(!x) return;
  var m = x.m, faltou = [];
  $("fTitulo").value = m.titulo || "";
  $("fDetalhes").value = m.detalhes || "";
  $("fPassos").value = (m.passos || []).join("\n");
  [["categoria", "fCategoria", "Categoria"], ["subcategoria", "fSubcategoria", "Subcategoria"],
   ["prioridade", "fPrioridade", "Prioridade"], ["canal", "fCanal", "Canal"], ["empresa", "fEmpresa", "Empresa"]]
    .forEach(function(t){
      if(!m[t[0]]) return;
      $(t[1]).value = m[t[0]];
      /* a opção pode ter sido apagada no portal depois que o modelo foi salvo */
      if($(t[1]).value !== String(m[t[0]])) faltou.push(t[2]);
    });
  $("fPrioridade").dispatchEvent(new Event("change"));
  $("modeloAviso").textContent = "Modelo aplicado" + (x.meu ? "" : " (ponto de partida: ajuste ao que vocês fazem)") +
    ". Complete o que falta e clique em Salvar chamado." +
    (faltou.length ? " Não achei no portal a opção que estava salva em: " + faltou.join(", ") + "." : "");
  $("fTitulo").focus();
}
function salvarModelo(){
  var nome = ($("fModeloNome").value.trim() || $("fModelo").value || "").slice(0, 60);
  if(!nome){
    $("modeloAviso").textContent = "Dê um nome ao modelo antes de salvar.";
    $("fModeloNome").focus();
    return;
  }
  var m = {
    /* o nome fica como foi digitado: "Troca de toner — " com o espaço no fim é
       para continuar escrevendo dali */
    nome: nome, titulo: $("fTitulo").value, detalhes: $("fDetalhes").value,
    passos: passosDoFormulario(),
    categoria: $("fCategoria").value, subcategoria: $("fSubcategoria").value,
    prioridade: $("fPrioridade").value, canal: $("fCanal").value, empresa: $("fEmpresa").value
  };
  var existia = false;
  modelosMeus = modelosMeus.map(function(o){ if(o.nome === nome){ existia = true; return m; } return o; });
  if(!existia) modelosMeus.unshift(m);
  save(K.modelos, modelosMeus);
  $("fModeloNome").value = "";
  pintarModelos();
  $("fModelo").value = nome;
  pintarModelos();
  $("modeloAviso").textContent = "Modelo “" + nome + "” " + (existia ? "atualizado" : "salvo") + " neste navegador.";
}

if($("fModelo")){
  $("fModelo").addEventListener("change", function(){
    pintarModelos();
    if(this.value) aplicarModelo(this.value);
    else $("modeloAviso").textContent = "";
  });
  $("btnModeloSalvar").addEventListener("click", salvarModelo);
  $("fModeloNome").addEventListener("keydown", function(e){ if(e.key === "Enter") salvarModelo(); });
  $("btnModeloApagar").addEventListener("click", function(){
    var nome = $("fModelo").value, b = this;
    if(!nome) return;
    /* dois toques, como no cronômetro: apagar sem querer custa a lista inteira */
    if(b.dataset.confirma !== "1"){
      b.dataset.confirma = "1"; b.textContent = "confirmar";
      setTimeout(function(){ b.dataset.confirma = ""; b.textContent = "apagar modelo"; }, 4000);
      return;
    }
    b.dataset.confirma = ""; b.textContent = "apagar modelo";
    modelosMeus = modelosMeus.filter(function(o){ return o.nome !== nome; });
    save(K.modelos, modelosMeus);
    $("fModelo").value = "";
    pintarModelos();
    $("modeloAviso").textContent = "Modelo “" + nome + "” apagado. O formulário ficou como estava.";
  });
  pintarModelos();
}
