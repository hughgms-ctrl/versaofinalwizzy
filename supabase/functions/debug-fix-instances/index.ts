Deno.serve(async (req) => {
    return new Response(JSON.stringify({
        disabled: true,
        message: 'debug-fix-instances foi desativada porque truncava phone_number e podia quebrar conversas existentes.',
    }), { status: 410, headers: { 'Content-Type': 'application/json' } });
});
