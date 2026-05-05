export default function MaintenancePage() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      textAlign: 'center',
      fontFamily: 'sans-serif'
    }}>
      <h1 style={{ fontSize: '3rem', marginBottom: '1rem' }}>🏗️</h1>
      <h1>Site em Manutenção</h1>
      <p style={{ color: '#666' }}>
        Pedimos desculpa pelo incómodo. Estamos a trabalhar em melhorias importantes.
      </p>
      <div style={{
        marginTop: '2rem',
        padding: '0.5rem 1rem',
        backgroundColor: '#000',
        color: '#fff',
        borderRadius: '5px'
      }}>
        Previsão de regresso: Amanhã as 14:00
      </div>
    </div>
  );
}
