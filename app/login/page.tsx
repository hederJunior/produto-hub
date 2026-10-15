"use client";

import { useEffect, useState, type FormEvent } from "react";

// Login por código (2026-10-15): passo 1 = e-mail → o Supabase envia um código de 6 dígitos;
// passo 2 = digita o código aqui. Antes era link mágico, que scanners de e-mail corporativo
// "consumiam" antes do clique do usuário (erro otp_expired) — ver app/api/auth/request-link.
const ESPERA_REENVIO_S = 60; // o Supabase limita 1 envio por e-mail a cada 60s

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [codigo, setCodigo] = useState("");
  const [etapa, setEtapa] = useState<"email" | "codigo">("email");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [espera, setEspera] = useState(0);

  // Quem cair aqui por um link antigo expirado (#error=...otp_expired) recebe uma explicação
  // amigável em vez de uma tela de login "muda".
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash.includes("otp_expired")) {
      setAviso("O link de acesso expirou ou já foi usado. Informe seu e-mail para receber um código de acesso.");
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera((e) => e - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  async function solicitarCodigo(e?: FormEvent) {
    e?.preventDefault();
    setCarregando(true);
    setErro(null);
    try {
      const res = await fetch("/api/auth/request-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) throw new Error("Falha ao solicitar o código.");
      setAviso(null);
      setCodigo("");
      setEtapa("codigo");
      setEspera(ESPERA_REENVIO_S);
    } catch {
      setErro("Não foi possível enviar o código agora. Tente novamente em instantes.");
    } finally {
      setCarregando(false);
    }
  }

  async function confirmarCodigo(e: FormEvent) {
    e.preventDefault();
    setCarregando(true);
    setErro(null);
    try {
      const res = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), token: codigo }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.erro ?? "Código inválido ou expirado.");
      }
      // Recarga completa (não router.push) pra o middleware já enxergar o cookie de sessão novo.
      window.location.href = "/";
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Código inválido ou expirado.");
      setCarregando(false);
    }
  }

  const botao = (desabilitado: boolean) => ({
    width: "100%",
    padding: 10,
    background: "#FF3D03",
    color: "#fff",
    border: "none",
    borderRadius: 4,
    cursor: desabilitado ? "default" : "pointer",
    opacity: desabilitado ? 0.7 : 1,
    fontSize: 14,
  });
  const link = { background: "none", border: "none", padding: 0, color: "#555", textDecoration: "underline", cursor: "pointer", fontSize: 13 } as const;

  return (
    <main style={{ maxWidth: 380, margin: "80px auto", fontFamily: "sans-serif", padding: 24 }}>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>Produto Hub</h1>
      <p style={{ color: "#555", marginBottom: 24, lineHeight: 1.4 }}>
        Acesso restrito ao time de Produto (KMM4/KMM5). Informe seu e-mail corporativo para receber um
        código de acesso — sem senha.
      </p>

      {aviso && <p style={{ color: "#8a5a00", background: "#fff6e0", padding: 10, borderRadius: 4, fontSize: 13, lineHeight: 1.4 }}>{aviso}</p>}

      {etapa === "email" ? (
        <form onSubmit={solicitarCodigo}>
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="voce@nstech.com.br"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: "100%", padding: 10, marginBottom: 12, boxSizing: "border-box", fontSize: 14 }}
          />
          <button type="submit" disabled={carregando} style={botao(carregando)}>
            {carregando ? "Enviando..." : "Enviar código de acesso"}
          </button>
          {erro && <p style={{ color: "crimson", marginTop: 8, fontSize: 13 }}>{erro}</p>}
        </form>
      ) : (
        <form onSubmit={confirmarCodigo}>
          <p style={{ marginBottom: 12, lineHeight: 1.4, fontSize: 14 }}>
            Se <strong>{email.trim()}</strong> estiver liberado, você vai receber um código de acesso em instantes.
            Digite-o abaixo (confira também o spam).
          </p>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]*"
            maxLength={10}
            required
            autoFocus
            placeholder="000000"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.replace(/[^\d\s]/g, ""))}
            style={{ width: "100%", padding: 10, marginBottom: 12, boxSizing: "border-box", fontSize: 22, letterSpacing: 6, textAlign: "center" }}
          />
          <button type="submit" disabled={carregando || codigo.replace(/\s/g, "").length < 6} style={botao(carregando || codigo.replace(/\s/g, "").length < 6)}>
            {carregando ? "Verificando..." : "Entrar"}
          </button>
          {erro && <p style={{ color: "crimson", marginTop: 8, fontSize: 13 }}>{erro}</p>}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
            <button type="button" style={link} onClick={() => { setEtapa("email"); setErro(null); setCodigo(""); }}>
              Usar outro e-mail
            </button>
            <button type="button" style={{ ...link, opacity: espera > 0 || carregando ? 0.5 : 1, cursor: espera > 0 || carregando ? "default" : "pointer" }} disabled={espera > 0 || carregando} onClick={() => solicitarCodigo()}>
              {espera > 0 ? `Reenviar código (${espera}s)` : "Reenviar código"}
            </button>
          </div>
        </form>
      )}
    </main>
  );
}
