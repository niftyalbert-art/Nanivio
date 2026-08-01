export default function LockScreen() {
  return (
    <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center px-6 gap-8">
      <div className="flex flex-col items-center gap-4 text-center">
        <img
          src={`${import.meta.env.BASE_URL}logo.png`}
          alt="Nanivio"
          className="w-24 h-24 rounded-2xl shadow-2xl"
        />
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Nanivio</h1>
          <p className="text-sm text-muted-foreground mt-1">Money Without Borders</p>
        </div>
      </div>

      <div className="flex flex-col items-center gap-3 w-full max-w-xs">
        <p className="text-sm text-muted-foreground">You've been signed out</p>
        <button
          onClick={() => {
            localStorage.removeItem('nanivio_signed_out');
            window.location.reload();
          }}
          className="w-full bg-primary text-primary-foreground font-bold py-3 rounded-xl text-sm hover:bg-primary/90 transition-colors"
        >
          Sign Back In
        </button>
      </div>
    </div>
  );
}
