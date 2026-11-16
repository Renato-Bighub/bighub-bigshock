const esc = (s: string) => s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" })[c]!);

function layout(title: string, bodyHtml: string, cta?: { label: string; url: string }) {
  return `<!doctype html><html lang="pt"><body style="margin:0;background:#f6f7f9;font-family:Arial,Helvetica,sans-serif;color:#0b1015">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:12px;overflow:hidden">
<tr><td style="background:#0b1015;padding:18px 24px;color:#fff;font-size:22px;font-weight:800">BIG<span style="color:#ee0d3e">stock</span> <span style="font-size:11px;font-weight:600">by BIGhub</span></td></tr>
<tr><td style="padding:28px 24px"><h1 style="margin:0 0 12px;font-size:20px">${esc(title)}</h1>${bodyHtml}
${cta ? `<p style="margin:24px 0"><a href="${esc(cta.url)}" style="background:#e4072d;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:700;display:inline-block">${esc(cta.label)}</a></p><p style="font-size:12px;color:#606773">Se o botão não funcionar, copie este endereço para o navegador:<br>${esc(cta.url)}</p>` : ""}
</td></tr>
<tr><td style="padding:16px 24px;font-size:12px;color:#606773;border-top:1px solid #eef0f3">Recebeu este e-mail porque existe uma conta BIGstock associada a este endereço. Se não reconhece esta ação, ignore a mensagem.</td></tr>
</table></td></tr></table></body></html>`;
}

export interface Rendered {
  subject: string;
  html: string;
  text: string;
}

export const verifyEmailTemplate = (name: string | null, url: string): Rendered => ({
  subject: "Confirme o seu e-mail — BIGstock",
  html: layout("Confirme o seu e-mail", `<p>Olá${name ? ` ${esc(name)}` : ""}, confirme o seu endereço para proteger a conta e aceitar convites. A ligação é válida durante 24 horas.</p>`, { label: "Confirmar e-mail", url }),
  text: `Confirme o seu e-mail (válido 24 horas): ${url}`,
});

export const passwordResetTemplate = (name: string | null, url: string): Rendered => ({
  subject: "Redefinir a senha — BIGstock",
  html: layout("Redefinir a senha", `<p>Olá${name ? ` ${esc(name)}` : ""}, recebemos um pedido para redefinir a senha. A ligação é válida durante 1 hora e só pode ser usada uma vez. Se não foi você, ignore este e-mail: a sua senha não muda.</p>`, { label: "Escolher nova senha", url }),
  text: `Redefinir a senha (válido 1 hora, uso único): ${url}\nSe não foi você, ignore este e-mail.`,
});

export const passwordChangedTemplate = (name: string | null): Rendered => ({
  subject: "A sua senha foi alterada — BIGstock",
  html: layout("Senha alterada", `<p>Olá${name ? ` ${esc(name)}` : ""}, a senha da sua conta foi alterada e as outras sessões foram terminadas. Se não foi você, redefina a senha de imediato e contacte o suporte.</p>`),
  text: "A senha da sua conta foi alterada e as outras sessões foram terminadas. Se não foi você, redefina a senha de imediato.",
});

export const invitationTemplate = (inviter: string, org: string, url: string): Rendered => ({
  subject: `${inviter} convidou-o para ${org} — BIGstock`,
  html: layout("Foi convidado", `<p><strong>${esc(inviter)}</strong> convidou-o para a organização <strong>${esc(org)}</strong> no BIGstock. O convite é válido durante 7 dias e só pode ser aceite com este endereço de e-mail.</p>`, { label: "Aceitar convite", url }),
  text: `${inviter} convidou-o para ${org} no BIGstock. Aceitar (válido 7 dias): ${url}`,
});
