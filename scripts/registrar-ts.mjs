// Permite rodar testes .ts direto no Node (que remove os tipos sozinho): resolve imports relativos sem extensão
// ("./fluxo-po-campos") como ".ts", igual ao bundler do Next. Uso: node --import ./scripts/registrar-ts.mjs --test <arquivo>
import { register } from "node:module";
register("./resolver-ts.mjs", import.meta.url);
