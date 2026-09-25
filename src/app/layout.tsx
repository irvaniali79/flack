import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Acme Chat — Where work happens",
  description:
    "Acme Chat is your team workspace: channels, DMs, threads, AI agents as teammates, and automations — all in one place.",
  keywords: ["Acme Chat", "team chat", "AI agents", "workflows", "messaging"],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "Acme Chat — Where work happens",
    description: "Channels, DMs & threads with AI teammates and automations.",
    siteName: "Acme Chat",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {/* Pre-paint accent theme — reads localStorage before first paint so the
            app (and the login screen) never flashes the default green. The store
            reconciles this guess with the profile value once /api/bootstrap
            resolves. Must stay the first child of <body>. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var a=localStorage.getItem('acme-accent');if(typeof a==='string'&&a)document.documentElement.dataset.accent=a}catch(e){}})()",
          }}
        />
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster position="bottom-right" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
