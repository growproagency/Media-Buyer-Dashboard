import "./globals.css";

export const metadata = {
  title: "Media Buyers — Meta Dashboard",
  description: "Live Facebook/Meta numbers per Media Buyer, with ClickUp account context.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
