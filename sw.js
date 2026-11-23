"use strict";
/* ---------------- service worker ----------------
   Duas coisas, e só elas:

   1. Sempre que há rede, busca os arquivos da página conferindo com o servidor
      em vez de confiar na cópia do navegador. Versão nova passa a chegar
      sozinha, sem Ctrl+Shift+R.
   2. Guarda uma cópia do que buscou. Sem rede, a página abre com essa cópia —
      a Captura rápida funciona, e o que for anotado fica na fila até a rede
      voltar.

   Nunca toca no que vai para o Bitrix: só responde a GET do próprio site.
   Chamada a outro endereço, e qualquer POST, passam direto, sem cópia. */

var CACHE = "chamados-ti-1";
var ARQUIVOS = ["./", "estilo.css", "tema.css", "manifest.webmanifest", "icone.svg",
  "config.js", "util.js", "bitrix.js", "painel.js", "dash.js", "etiquetas.js", "kanban.js", "relatorio.js",
  "importar.js", "doc.js", "tarefas.js", "parecidos.js", "diagnostico.js", "cronometro.js",
  "app.js", "modelos.js", "boot.js", "instalar.js", "extras.js", "inventario.js", "qr.js", "mais.js", "servico.js", "parque.js", "captura.js", "acesso.js", "avaliar.html"];

self.addEventListener("install", function(e){
  /* um arquivo que falhe não impede os outros: a cópia se completa no uso */
  e.waitUntil(caches.open(CACHE).then(function(c){
    return Promise.all(ARQUIVOS.map(function(a){
      return fetch(a, {cache: "no-cache"}).then(function(r){ if(r && r.ok) return c.put(a, r); })
        .catch(function(){});
    }));
  }).then(function(){ return self.skipWaiting(); }));
});
self.addEventListener("activate", function(e){
  e.waitUntil(caches.keys().then(function(ks){
    return Promise.all(ks.filter(function(k){ return k !== CACHE; }).map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});
/* "compartilhar" do celular (página instalada no Android): o WhatsApp manda a
   conversa exportada para ./compartilhar. Guarda o texto na cópia local e abre a
   Captura, que lê e apaga (ver captura.js). Nada sai do aparelho. */
function receberCompartilhado(req){
  return req.formData().then(function(fd){
    var arquivos = fd.getAll("arquivos").filter(function(f){ return f && typeof f !== "string"; });
    return Promise.all(arquivos.slice(0, 10).map(function(f){
      var zip = /zip/i.test(f.type || "") || /\.zip$/i.test(f.name || "");
      if(zip || f.size > 5 * 1024 * 1024) return {nome: f.name || "arquivo", texto: "", zip: zip};
      return f.text().then(function(t){ return {nome: f.name || "conversa.txt", texto: t}; });
    })).then(function(lidos){
      var texto = [fd.get("titulo"), fd.get("texto")].filter(function(x){ return typeof x === "string" && x.trim(); }).join("\n");
      return caches.open(CACHE).then(function(c){
        return c.put("./__compartilhado.json", new Response(JSON.stringify({arquivos: lidos, texto: texto}),
          {headers: {"Content-Type": "application/json"}}));
      });
    });
  }).catch(function(){}).then(function(){
    return Response.redirect(new URL("./?compartilhado=1#captura", self.registration.scope).href, 303);
  });
}
self.addEventListener("fetch", function(e){
  var req = e.request;
  if(req.method === "POST" && /\/compartilhar\/?$/.test(new URL(req.url).pathname)){
    e.respondWith(receberCompartilhado(req));
    return;
  }
  if(req.method !== "GET") return;
  if(new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req, {cache: "no-cache"}).then(function(resp){
      if(resp && resp.ok){
        var copia = resp.clone();
        caches.open(CACHE).then(function(c){ c.put(req, copia); });
      }
      return resp;
    }).catch(function(){
      /* sem rede: a cópia guardada; para a própria página, a raiz serve */
      return caches.match(req, {ignoreSearch: true}).then(function(r){
        return r || (req.mode === "navigate" ? caches.match("./") : Response.error());
      });
    })
  );
});
