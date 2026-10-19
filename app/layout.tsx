export const metadata = {
  title: 'VenueFlow API',
  description: 'Multi-Venue Ticketing Platform Backend API',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
