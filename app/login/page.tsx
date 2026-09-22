"use client";

import { useState, type FormEvent } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "enviando" | "enviado">("idle");
  const [erro, setErro] = useState<string | null>(null);

  async function enviarLink(e: FormEvent) {
    e.preventDefault();
    setStatus("enviando");
    setErro(null);
    try {
      const res = await fetch("/api/auth/request-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error("Falha ao solicitar o link.");
      setStatus("enviado");
    } catch {
      setErro("Não foi possível enviar o link agora. Tente novamente em instantes.");
      setStatus("idle");
    }
  }

  return (
    <main style={{ maxWidth: 380, margin: "80px auto", fontFamily: "sans-serif", padding: 24 }}>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>Produto Hub</h1>
      <p style={{ color: "#555", marginBottom: 24, lineHeight: 1.4 }}>
        Acesso restrito ao time de Produto (KMM4/KMM5). Informe seu e-mail corporativo para
        receber um link de acesso — sem senha.
      </p>

      {status === "enviado" ? (
        <p>
          Se esse e-mail estiver liberado, você vai receber um link de acesso em instantes.
          Confira sua caixa de entrada.
        </p>
      ) : (
        <form onSubmit={enviarLink}>
          <input
            type="email"
            required
            placeholder="voce@nstech.com.br"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: "100%", padding: 10, marginBottom: 12, boxSizing: "border-box", fontSize: 14 }}
          />
          <button
            type="submit"
            disabled={status === "enviando"}
            style={{
              width: "100%",
              padding: 10,
              background: "#FF3D03",
              color: "#fff",
              border: "none",
              borderRadius: 4,
              cursor: status === "enviando" ? "default" : "pointer",
              opacity: status === "enviando" ? 0.7 : 1,
              fontSize: 14,
            }}
          >
            {status === "enviando" ? "Enviando..." : "Enviar link de acesso"}
          </button>
          {erro && <p style={{ color: "crimson", marginTop: 8, fontSize: 13 }}>{erro}</p>}
        </form>
      )}
    </main>
  );
}
