export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm">
        <h1 className="text-4xl font-bold mb-4">
          Sistema de Gestión de Alquileres
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400 mb-8">
          Bienvenido al portal de gestión de propiedades
        </p>
        <div className="flex gap-4">
          <a 
            href="/properties" 
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
          >
            Gestionar Propiedades
          </a>
          <a 
            href="/tenants" 
            className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold"
          >
            Gestionar Inquilinos
          </a>
          <a 
            href="/leases" 
            className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-semibold"
          >
            Gestionar Contratos
          </a>
        </div>
      </div>
    </main>
  );
}
