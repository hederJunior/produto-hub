export const metadata = {
  title: "Produto Hub — KMM4/KMM5",
  description: "Indicadores, alertas e controles do time de Produto.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
