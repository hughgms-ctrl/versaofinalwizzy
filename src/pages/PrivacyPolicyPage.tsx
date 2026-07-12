import { Link } from 'react-router-dom';
import wizzyLogo from '@/assets/wizzy-logo.png';

const LAST_UPDATED = '9 de julho de 2026';

export default function PrivacyPolicyPage() {
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
        <h1 className="text-3xl font-bold text-white">Política de Privacidade</h1>
        <p className="mt-2 text-sm text-slate-500">Última atualização: {LAST_UPDATED}</p>

        <div className="prose-invert mt-10 space-y-8 text-[15px] leading-7 text-slate-300">
          <section>
            <p>
              Esta Política de Privacidade descreve como o <strong>Wizzy</strong> ("nós", "nosso" ou "Plataforma"),
              uma plataforma de gestão de conversas, automação e CRM para WhatsApp e Instagram, coleta, usa,
              armazena e protege as informações de clientes ("você", "cliente" ou "usuário") que utilizam a
              plataforma, e das pessoas que interagem com os clientes do Wizzy através do WhatsApp ou do Instagram
              ("contatos finais").
            </p>
            <p>
              Ao criar uma conta ou utilizar o Wizzy, você concorda com a coleta e o uso de informações de acordo
              com esta política, em conformidade com a Lei Geral de Proteção de Dados Pessoais (LGPD — Lei nº
              13.709/2018) e com as políticas de plataforma da Meta (Facebook, WhatsApp e Instagram).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">1. Quem somos e o que o Wizzy faz</h2>
            <p>
              O Wizzy é uma plataforma que permite a empresas e profissionais conectar seus próprios números de
              WhatsApp e contas profissionais do Instagram para centralizar o atendimento, automatizar respostas,
              organizar contatos em um funil (pipeline), disparar campanhas e utilizar agentes de inteligência
              artificial para qualificar leads, entre outras funcionalidades de CRM.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">2. Quais dados coletamos</h2>
            <h3 className="mt-4 font-semibold text-slate-100">2.1 Dados da conta do cliente</h3>
            <ul className="list-disc space-y-1 pl-6">
              <li>Nome, e-mail, telefone e senha (criptografada) usados no cadastro;</li>
              <li>Dados da organização/empresa e da equipe (nomes de membros, cargos, permissões);</li>
              <li>Dados de pagamento e faturamento, processados por gateways de pagamento parceiros (não
                armazenamos números completos de cartão de crédito em nossos servidores);</li>
              <li>Registros de uso da plataforma (logs de acesso, ações realizadas, auditoria).</li>
            </ul>

            <h3 className="mt-4 font-semibold text-slate-100">2.2 Dados conectados via WhatsApp</h3>
            <p>
              Quando você conecta um número de WhatsApp, processamos as mensagens, contatos, grupos e mídias
              trocados através desse número, para exibi-los no painel de Conversas, permitir atendimento humano e
              automações configuradas por você.
            </p>

            <h3 className="mt-4 font-semibold text-slate-100">2.3 Dados conectados via Instagram (API oficial da Meta)</h3>
            <p>
              Quando você conecta uma conta profissional do Instagram através do login oficial da Meta, o Wizzy
              acessa, com sua autorização explícita, os seguintes dados por meio das permissões concedidas:
            </p>
            <ul className="list-disc space-y-1 pl-6">
              <li><code>instagram_business_basic</code>: identificador, nome de usuário e informações públicas de
                perfil da conta profissional conectada;</li>
              <li><code>instagram_business_manage_comments</code>: comentários recebidos em publicações e reels da
                conta conectada, para permitir a automação de respostas e curtidas configuradas por você;</li>
              <li><code>instagram_business_manage_messages</code>: mensagens diretas (DMs) trocadas com a conta
                conectada, para exibi-las no painel de Conversas e permitir respostas automáticas ou manuais.</li>
            </ul>
            <p>
              Esses dados são usados <strong>exclusivamente</strong> para prestar as funcionalidades descritas nesta
              política e nunca são vendidos, alugados ou utilizados para fins de publicidade fora da plataforma,
              em conformidade com a Política de Plataforma da Meta.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">3. Como usamos os dados</h2>
            <ul className="list-disc space-y-1 pl-6">
              <li>Exibir e organizar conversas de WhatsApp e Instagram em um painel unificado;</li>
              <li>Executar automações e fluxos configurados pelo próprio cliente (respostas automáticas, tags,
                encaminhamento para atendimento humano);</li>
              <li>Processar mensagens com agentes de inteligência artificial, quando configurado pelo cliente, para
                qualificar leads e sugerir respostas;</li>
              <li>Gerar relatórios e métricas de atendimento e conversão para o cliente;</li>
              <li>Cobrança e gestão da assinatura do cliente;</li>
              <li>Cumprir obrigações legais e prevenir fraude ou uso indevido da plataforma.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">4. Com quem compartilhamos dados</h2>
            <p>Não vendemos dados pessoais. Compartilhamos dados apenas com:</p>
            <ul className="list-disc space-y-1 pl-6">
              <li>Provedores de infraestrutura e banco de dados (ex.: Supabase) que armazenam os dados de forma
                segura em nosso nome, sob contrato de confidencialidade;</li>
              <li>Provedores de inteligência artificial (ex.: OpenAI e similares), quando o cliente ativa recursos de
                IA, apenas para processar o conteúdo necessário à funcionalidade solicitada;</li>
              <li>Gateways de pagamento, para processar cobranças;</li>
              <li>A própria Meta (WhatsApp Business Platform e Instagram Graph API), na medida necessária para o
                funcionamento da integração autorizada pelo cliente;</li>
              <li>Autoridades públicas, quando exigido por lei ou ordem judicial.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">5. Armazenamento e segurança</h2>
            <p>
              Os dados são armazenados em servidores com criptografia em trânsito (HTTPS/TLS) e controles de acesso
              baseados em função. O acesso aos dados de cada organização é isolado por meio de políticas de
              segurança em nível de linha (Row Level Security) no banco de dados, impedindo que uma organização
              acesse dados de outra.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">6. Seus direitos (LGPD)</h2>
            <p>Você pode, a qualquer momento, solicitar:</p>
            <ul className="list-disc space-y-1 pl-6">
              <li>Confirmação da existência de tratamento e acesso aos seus dados;</li>
              <li>Correção de dados incompletos, inexatos ou desatualizados;</li>
              <li>Anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desconformidade com a
                LGPD;</li>
              <li>Portabilidade dos dados a outro fornecedor de serviço;</li>
              <li>Eliminação dos dados pessoais tratados com o seu consentimento, exceto nas hipóteses de guarda
                obrigatória previstas em lei;</li>
              <li>Revogação do consentimento, incluindo a desconexão imediata do WhatsApp ou do Instagram nas
                Configurações da plataforma.</li>
            </ul>
            <p>
              Para exercer esses direitos ou solicitar a exclusão completa da sua conta e dos dados associados,
              consulte nossas{' '}
              <Link to="/exclusao-de-dados" className="text-white underline">
                Instruções de Exclusão de Dados
              </Link>{' '}
              ou entre em contato pelo e-mail abaixo.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">7. Retenção de dados</h2>
            <p>
              Mantemos os dados enquanto a conta estiver ativa e pelo período adicional necessário para cumprir
              obrigações legais, fiscais ou regulatórias. Após o encerramento da conta e a ausência de exigências
              legais de retenção, os dados são excluídos ou anonimizados.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">8. Menores de idade</h2>
            <p>O Wizzy é destinado a empresas e profissionais maiores de 18 anos. Não coletamos intencionalmente
              dados de crianças ou adolescentes.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">9. Alterações a esta política</h2>
            <p>
              Podemos atualizar esta Política de Privacidade periodicamente. Alterações relevantes serão
              comunicadas por e-mail ou aviso dentro da plataforma.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">10. Contato</h2>
            <p>
              Dúvidas sobre esta política ou sobre o tratamento dos seus dados podem ser enviadas para{' '}
              <a href="mailto:privacidade@wizzy.app" className="text-white underline">privacidade@wizzy.app</a>.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
