import { Link } from 'react-router-dom';
import wizzyLogo from '@/assets/wizzy-logo.png';

const LAST_UPDATED = '9 de julho de 2026';

export default function DataDeletionPage() {
  return (
    <div className="min-h-screen bg-[#0b0b12] text-slate-300">
      <header className="border-b border-white/10 px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <Link to="/" className="flex items-center gap-3">
            <img src={wizzyLogo} alt="Wizzy" className="h-9 w-9 rounded-xl object-contain" />
            <span className="text-lg font-bold text-white">Wizzy</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-white">Instruções de Exclusão de Dados</h1>
        <p className="mt-2 text-sm text-slate-500">Última atualização: {LAST_UPDATED}</p>

        <div className="prose-invert mt-10 space-y-8 text-[15px] leading-7 text-slate-300">
          <section>
            <p>
              Esta página explica como solicitar a exclusão dos seus dados pessoais e dos dados coletados através
              das integrações de WhatsApp e Instagram no Wizzy, em conformidade com a LGPD e com os requisitos da
              Meta Platform Policy para aplicativos que utilizam login e dados do Facebook/Instagram.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">1. Desconectar uma integração (imediato)</h2>
            <p>
              Se você é cliente do Wizzy e deseja apenas parar a coleta de novos dados de uma conta do Instagram ou
              WhatsApp, acesse <strong>Configurações</strong> dentro da plataforma, localize a conta conectada e
              clique em <strong>"Desconectar"</strong>. Isso revoga imediatamente o acesso do Wizzy àquela conta e
              interrompe a coleta de novas mensagens, comentários ou eventos.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">2. Excluir todos os dados da sua conta</h2>
            <p>
              Para solicitar a exclusão completa e definitiva da sua conta e de todos os dados pessoais associados
              (incluindo conversas, contatos, mensagens de WhatsApp e Instagram, e informações de faturamento não
              exigidas por obrigação legal), envie um e-mail para{' '}
              <a href="mailto:privacidade@wizzy.app" className="text-white underline">privacidade@wizzy.app</a>{' '}
              a partir do endereço cadastrado na sua conta, com o assunto <strong>"Solicitação de exclusão de
              dados"</strong>, informando:
            </p>
            <ul className="list-disc space-y-1 pl-6">
              <li>Nome completo e e-mail da conta;</li>
              <li>Nome da organização/empresa cadastrada no Wizzy;</li>
              <li>Confirmação de que deseja excluir permanentemente a conta e os dados associados.</li>
            </ul>
            <p>
              Processaremos a solicitação em até <strong>15 dias corridos</strong> e enviaremos uma confirmação por
              e-mail quando a exclusão for concluída. Dados que precisem ser retidos por obrigação legal, fiscal ou
              regulatória (por exemplo, registros fiscais de cobrança) serão mantidos apenas pelo período
              exigido em lei, e não mais utilizados para qualquer outra finalidade.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">3. Se você é um contato final (não é cliente do Wizzy)</h2>
            <p>
              Se alguém enviou uma mensagem para uma empresa que usa o Wizzy pelo WhatsApp ou Instagram, e você
              deseja que os dados dessa conversa sejam removidos, entre em contato diretamente com a empresa (o
              número de WhatsApp ou conta do Instagram para a qual você enviou a mensagem) — ela é a controladora
              dos seus dados nessa conversa e pode solicitar a exclusão ao Wizzy em seu nome. Alternativamente, você
              pode escrever para <a href="mailto:privacidade@wizzy.app" className="text-white underline">privacidade@wizzy.app</a>{' '}
              identificando a empresa e o número/conta envolvidos, e faremos a intermediação do pedido.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">4. Mais informações</h2>
            <p>
              Para entender melhor quais dados coletamos e como os utilizamos, consulte nossa{' '}
              <Link to="/privacidade" className="text-white underline">Política de Privacidade</Link>.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
