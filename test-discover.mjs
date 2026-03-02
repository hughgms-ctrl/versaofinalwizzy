const baseUrl = 'https://lhzap.uazapi.com';
const paths = [
    '/chats',
    '/chat/fetchChats',
    '/chat/find',
    '/message/fetchMessages',
    '/chat/list',
    '/instance/chats',
    '/chat/getChats',
    '/messages',
    '/message/list'
];

async function run() {
    for (const path of paths) {
        try {
            const r = await fetch(`${baseUrl}${path}`);
            console.log(`GET ${path.padEnd(25)} -> Status: ${r.status}`);
        } catch (e) {
            console.log(`GET ${path} -> Error: ${e.message}`);
        }
    }
}
run();
