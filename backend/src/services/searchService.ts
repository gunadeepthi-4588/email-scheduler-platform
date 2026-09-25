import prisma from '../config/database';

export interface SearchResultItem {
  id: number;
  fromEmail: string;
  toEmail: string;
  subject: string;
  body: string;
  status: string;
  scheduleAt: Date;
  sentAt: Date | null;
  userId: number;
  createdAt: Date;
  updatedAt: Date;
}

export async function searchEmails(query: string): Promise<{
  source: 'elasticsearch' | 'database';
  total: number;
  results: SearchResultItem[];
}> {
  const cleanQuery = query.trim();

  if (!cleanQuery) {
    const allEmails = await prisma.email.findMany({
      orderBy: { scheduleAt: 'desc' },
    });
    return {
      source: 'database',
      total: allEmails.length,
      results: allEmails,
    };
  }

  const esNode = process.env.ELASTICSEARCH_NODE || process.env.ELASTICSEARCH_URL;

  // Try Elasticsearch if configured
  if (esNode && esNode.trim() !== '') {
    try {
      const response = await fetch(`${esNode}/emails/_search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.ELASTICSEARCH_API_KEY
            ? { Authorization: `ApiKey ${process.env.ELASTICSEARCH_API_KEY}` }
            : {}),
        },
        body: JSON.stringify({
          query: {
            multi_match: {
              query: cleanQuery,
              fields: ['toEmail', 'fromEmail', 'subject', 'body'],
              fuzziness: 'AUTO',
            },
          },
        }),
      });

      if (response.ok) {
        const esData = (await response.json()) as any;
        const hits = esData?.hits?.hits || [];
        const results = hits.map((hit: any) => ({
          id: hit._source.id,
          fromEmail: hit._source.fromEmail,
          toEmail: hit._source.toEmail,
          subject: hit._source.subject,
          body: hit._source.body,
          status: hit._source.status,
          scheduleAt: new Date(hit._source.scheduleAt),
          sentAt: hit._source.sentAt ? new Date(hit._source.sentAt) : null,
          userId: hit._source.userId,
          createdAt: new Date(hit._source.createdAt),
          updatedAt: new Date(hit._source.updatedAt),
        }));

        return {
          source: 'elasticsearch',
          total: results.length,
          results,
        };
      }
    } catch (esError) {
      console.warn('[SearchService] Elasticsearch query failed, falling back to database search:', esError);
    }
  }

  // Database search fallback (PostgreSQL source of truth)
  const results = await prisma.email.findMany({
    where: {
      OR: [
        { toEmail: { contains: cleanQuery, mode: 'insensitive' } },
        { fromEmail: { contains: cleanQuery, mode: 'insensitive' } },
        { subject: { contains: cleanQuery, mode: 'insensitive' } },
        { body: { contains: cleanQuery, mode: 'insensitive' } },
      ],
    },
    orderBy: {
      scheduleAt: 'desc',
    },
  });

  return {
    source: 'database',
    total: results.length,
    results,
  };
}

export async function indexEmailInElasticsearch(email: any): Promise<void> {
  const esNode = process.env.ELASTICSEARCH_NODE || process.env.ELASTICSEARCH_URL;
  if (!esNode || esNode.trim() === '') {
    return;
  }

  try {
    await fetch(`${esNode}/emails/_doc/${email.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.ELASTICSEARCH_API_KEY
          ? { Authorization: `ApiKey ${process.env.ELASTICSEARCH_API_KEY}` }
          : {}),
      },
      body: JSON.stringify(email),
    });
  } catch (error) {
    console.warn('[SearchService] Failed to index email in Elasticsearch:', error);
  }
}
