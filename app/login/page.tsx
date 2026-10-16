"use client";

import { useEffect, useState, type FormEvent } from "react";

// Login por código (2026-10-15): passo 1 = e-mail → o Supabase envia um código de 6 dígitos;
// passo 2 = digita o código aqui. Antes era link mágico, que scanners de e-mail corporativo
// "consumiam" antes do clique do usuário (erro otp_expired) — ver app/api/auth/request-link.
const ESPERA_REENVIO_S = 60; // o Supabase limita 1 envio por e-mail a cada 60s

// Login com Microsoft (Entra ID) — 2026-10-16. Só aparece com NEXT_PUBLIC_LOGIN_MICROSOFT=true
// (ligar na Vercel DEPOIS de configurar o provider Azure no Supabase; exige novo deploy).
// O login por e-mail abaixo continua como fallback.
const MICROSOFT_ATIVO = process.env.NEXT_PUBLIC_LOGIN_MICROSOFT === "true";

const MENSAGENS_ERRO: Record<string, string> = {
  nao_liberado: "Sua conta Microsoft não está liberada para o Produto Hub. Peça o acesso ao time de Produto.",
  microsoft_indisponivel: "O login com Microsoft não está disponível agora. Use o e-mail abaixo.",
  oauth: "Não foi possível concluir o login com Microsoft. Tente novamente ou use o e-mail abaixo.",
  sessao: "Não foi possível validar o acesso (o link pode ter sido aberto em outro navegador ou já foi usado). Tente novamente.",
};

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
    if (typeof window === "undefined") return;
    if (window.location.hash.includes("otp_expired")) {
      setAviso("O link de acesso expirou ou já foi usado. Informe seu e-mail para receber um código de acesso.");
      window.history.replaceState(null, "", window.location.pathname);
      return;
    }
    const cod = new URLSearchParams(window.location.search).get("erro");
    if (cod && MENSAGENS_ERRO[cod]) {
      setErro(MENSAGENS_ERRO[cod]);
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
        Acesso restrito ao time de Produto (KMM4/KMM5).{" "}
        {MICROSOFT_ATIVO
          ? "Entre com sua conta corporativa Microsoft ou, se preferir, receba um acesso por e-mail."
          : "Informe seu e-mail corporativo para receber um acesso por e-mail — sem senha."}
      </p>

      {MICROSOFT_ATIVO && etapa === "email" && (
        <>
          <a
            href="/api/auth/microsoft"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10, width: "100%", padding: 10,
              boxSizing: "border-box", background: "#fff", color: "#222", border: "1px solid #8c8c8c", borderRadius: 4,
              fontSize: 14, textDecoration: "none", fontWeight: 600,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
              <rect x="1" y="1" width="9" height="9" fill="#F25022" />
              <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
              <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
              <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
            </svg>
            Entrar com Microsoft
          </a>
          {erro && <p style={{ color: "crimson", marginTop: 8, fontSize: 13, lineHeight: 1.4 }}>{erro}</p>}
          <p style={{ textAlign: "center", color: "#888", fontSize: 12, margin: "16px 0" }}>— ou por e-mail —</p>
        </>
      )}

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
            {carregando ? "Enviando..." : "Enviar e-mail de acesso"}
          </button>
          {erro && !MICROSOFT_ATIVO && <p style={{ color: "crimson", marginTop: 8, fontSize: 13 }}>{erro}</p>}
        </form>
      ) : (
        <form onSubmit={confirmarCodigo}>
          <p style={{ marginBottom: 12, lineHeight: 1.4, fontSize: 14 }}>
            Se <strong>{email.trim()}</strong> estiver liberado, você vai receber um e-mail em instantes (confira
            também o spam). Digite abaixo o <strong>código</strong> que veio no e-mail — ou, se o e-mail trouxer um
            link em vez de código, clique nele.
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
