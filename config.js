
/* WALTER SALGADOS — CONFIGURAÇÕES v2.0
 * Contato fornecido pelo cliente: +55 42 8865-7344 (8 dígitos após DDD).
 * IMPORTANTE: confirme se o número do WhatsApp possui um 9 inicial ausente
 * antes de publicar. Não inserimos dígitos que não foram informados.
 * O botão abre uma conversa preenchida; o usuário deve apertar ENVIAR no WhatsApp.
 * Preços de bebidas e atendimento são confirmados com o Walter.
 * Sem entrega/delivery: apenas retirada e consumo no local.
 */
window.WALTER_CONFIG = {
  whatsapp: '554288657344',
  orderApiEnabled: false, // true somente apos publicar Worker + D1 e configurar a API
  orderApiUrl: '/api/orders',
  whatsappNeedsConfirmation: true,
  enderecoRetirada: '',
  horarioAtendimento: '',
  bebidas: {
    coca: null,
    sprite: null,
    fanta: null,
    guarana: null,
    agua: null
  }
};

