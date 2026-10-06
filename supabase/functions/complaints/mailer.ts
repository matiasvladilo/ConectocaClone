export interface ComplaintMailer {
  send(input: {
    from: string;
    to: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<void>;
}

export interface ResendMailerOptions {
  apiKey: string;
  fetch?: typeof globalThis.fetch;
}

export function createResendMailer(options: ResendMailerOptions): ComplaintMailer {
  const fetchRequest = options.fetch ?? globalThis.fetch;

  return {
    async send(input) {
      const response = await fetchRequest('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        throw new Error(`Email provider rejected the request (${response.status})`);
      }
    },
  };
}
