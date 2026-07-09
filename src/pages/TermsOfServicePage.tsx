import { Link } from 'react-router-dom';
import wizzyLogo from '@/assets/wizzy-logo.png';

const LAST_UPDATED = '9 de julho de 2026';

export default function TermsOfServicePage() {
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
        <h1 className="text-3xl font-bold text-white">Termos de Uso</h1>
        <p className="mt-2 text-sm text-slate-500">Última atualização: {LAST_UPDATED}</p>

        <div className="prose-invert mt-10 space-y-8 text-[15px] leading-7 text-slate-300">
          <section>
            <p>
              Estes Termos de Uso ("Termos") regulam o uso da plataforma <strong>Wizzy</strong> ("Plataforma",
              "nós"), um serviço de gestão de conversas, automação e CRM para WhatsApp e Instagram. Ao criar uma
              conta ou utilizar o Wizzy, você ("cliente" ou "você") concorda integralmente com estes Termos.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">1. Descrição do serviço</h2>
            <p>
              O Wizzy permite conectar números de WhatsApp e contas profissionais do Instagram (via API oficial da
              Meta) para centralizar o atendimento ao cliente, automatizar respostas e fluxos, gerenciar contatos e
              pipelines de vendas, disparar campanhas e utilizar agentes de inteligência artificial, entre outras
              ferramentas oferecidas conforme o plano contratado.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">2. Cadastro e conta</h2>
            <ul className="list-disc space-y-1 pl-6">
              <li>Você deve fornecer informações verdadeiras, completas e atualizadas no cadastro;</li>
              <li>Você é responsável por manter a confidencialidade das credenciais de acesso da sua conta e de
                todos os membros da sua equipe convidados para a organização;</li>
              <li>Você deve ter capacidade legal e representar uma empresa ou atividade profissional lícita para
                utilizar o Wizzy;</li>
              <li>É proibido compartilhar credenciais de acesso com terceiros não autorizados ou revender o acesso
                à plataforma sem autorização prévia por escrito.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">3. Planos, cobrança e cancelamento</h2>
            <p>
              O acesso a determinadas funcionalidades depende da contratação de um plano pago, cobrado de forma
              recorrente conforme a periodicidade escolhida. Os valores, limites de uso (como número de conexões de
              WhatsApp/Instagram e volume de mensagens) e funcionalidades de cada plano estão descritos na página de
              planos da plataforma e podem ser alterados mediante aviso prévio.
            </p>
            <p>
              Você pode cancelar sua assinatura a qualquer momento pelas configurações da conta. O cancelamento
              interrompe cobranças futuras, mas não gera reembolso de períodos já pagos, salvo quando exigido por
              lei ou expressamente previsto em oferta específica.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">4. Uso aceitável</h2>
            <p>Ao usar o Wizzy, você concorda em não:</p>
            <ul className="list-disc space-y-1 pl-6">
              <li>Enviar mensagens em massa não solicitadas (spam), correntes, conteúdo enganoso ou fraudulento;</li>
              <li>Utilizar a plataforma para fins ilegais, discriminatórios, difamatórios ou que violem direitos de
                terceiros;</li>
              <li>Violar as políticas de uso da Meta para WhatsApp Business Platform e Instagram Graph API,
                incluindo regras sobre janela de mensagens, opt-in de contatos e conteúdo proibido;</li>
              <li>Tentar acessar dados de outras organizações clientes do Wizzy, realizar engenharia reversa ou
                comprometer a segurança da plataforma.</li>
            </ul>
            <p>
              O descumprimento destas regras pode resultar em suspensão ou encerramento da conta, sem prejuízo de
              eventuais medidas legais cabíveis.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">5. Integrações com WhatsApp e Instagram</h2>
            <p>
              As integrações com WhatsApp e Instagram dependem de contas e permissões de propriedade do cliente e
              estão sujeitas às políticas, disponibilidade e limites impostos pela Meta, sobre os quais o Wizzy não
              tem controle. O Wizzy não se responsabiliza por bloqueios, banimentos, instabilidades ou alterações
              nas APIs oficiais realizadas pela Meta que estejam fora do nosso controle razoável.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">6. Conteúdo e responsabilidade do cliente</h2>
            <p>
              Você é o único responsável pelo conteúdo enviado através da plataforma (mensagens, automações, fluxos
              de inteligência artificial e materiais de campanha), bem como pela obtenção do consentimento
              necessário dos seus contatos para recebimento de comunicações, quando exigido por lei.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">7. Propriedade intelectual</h2>
            <p>
              O Wizzy, sua marca, layout, código-fonte e demais elementos da plataforma são de propriedade exclusiva
              de seus desenvolvedores. Nenhuma disposição destes Termos transfere ao cliente qualquer direito de
              propriedade intelectual sobre a plataforma, exceto a licença de uso limitada, não exclusiva e
              intransferível concedida durante a vigência da assinatura.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">8. Limitação de responsabilidade</h2>
            <p>
              O Wizzy é fornecido "como está". Na máxima extensão permitida em lei, não nos responsabilizamos por
              danos indiretos, lucros cessantes ou perda de dados decorrentes de uso indevido da plataforma,
              indisponibilidade de serviços de terceiros (incluindo Meta, provedores de IA e gateways de pagamento)
              ou eventos fora do nosso controle razoável.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">9. Encerramento</h2>
            <p>
              Podemos suspender ou encerrar o acesso de contas que violem estes Termos ou as políticas de plataforma
              da Meta, mediante notificação, exceto em casos de violação grave que exijam ação imediata. Você pode
              solicitar o encerramento e a exclusão da sua conta a qualquer momento — veja nossas{' '}
              <Link to="/exclusao-de-dados" className="text-white underline">Instruções de Exclusão de Dados</Link>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">10. Alterações destes Termos</h2>
            <p>
              Podemos atualizar estes Termos periodicamente. Alterações relevantes serão comunicadas por e-mail ou
              aviso dentro da plataforma, e o uso continuado após a atualização representa aceite dos novos Termos.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">11. Legislação aplicável</h2>
            <p>
              Estes Termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o foro do domicílio
              do cliente, ou outro definido em contrato específico, para dirimir eventuais controvérsias.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">12. Contato</h2>
            <p>
              Dúvidas sobre estes Termos podem ser enviadas para{' '}
              <a href="mailto:contato@wizzy.app" className="text-white underline">contato@wizzy.app</a>.
            </p>
          </section>

          <p className="pt-4 text-sm text-slate-400">
            Consulte também nossa{' '}
            <Link to="/privacidade" className="text-white underline">Política de Privacidade</Link>.
          </p>
        </div>
      </main>
    </div>
  );
}
