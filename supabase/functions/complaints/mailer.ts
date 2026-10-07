export interface ComplaintMailer {
  send(input: {
    from: string;
    to: string | string[];
    subject: string;
    html: string;
    text: string;
  }): Promise<void>;
}

export interface ResendMailerOptions {
  apiKey: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}

export function createResendMailer(options: ResendMailerOptions): ComplaintMailer {
  const fetchRequest = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 8_000;

  return {
    async send(input) {
      const controller = new AbortController();
      let timeout: ReturnType<typeof setTimeout>;
      const deadline = new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new Error('Email provider timed out'));
        }, timeoutMs);
      });
      let response: Response;
      try {
        response = await Promise.race([
          fetchRequest('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${options.apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(input),
            signal: controller.signal,
          }),
          deadline,
        ]);
      } catch (error) {
        if (controller.signal.aborted) throw new Error('Email provider timed out');
        throw error;
      } finally {
        clearTimeout(timeout!);
      }

      if (!response.ok) {
        throw new Error(`Email provider rejected the request (${response.status})`);
      }
    },
  };
}
