import { Pinecone } from '@pinecone-database/pinecone';

// Store the Pinecone client instance
let pineconeClient: Pinecone | null = null;

/**
 * Initialize and return a Pinecone client
 * @returns Pinecone client instance
 */
export function getPineconeClient(): Pinecone {
  if (pineconeClient) {
    return pineconeClient;
  }

  const apiKey = process.env.PINECONE_API_KEY;
  
  if (!apiKey) {
    throw new Error('PINECONE_API_KEY environment variable is not defined');
  }

  // Initialize the Pinecone client
  pineconeClient = new Pinecone({
    apiKey,
  });

  return pineconeClient;
}

/**
 * Get the Pinecone index for vector operations
 * @returns Pinecone Index instance
 */
export function getPineconeIndex() {
  const client = getPineconeClient();
  const indexName = process.env.PINECONE_INDEX;

  if (!indexName) {
    throw new Error('PINECONE_INDEX environment variable is not defined');
  }

  // Get the index
  const index = client.index(indexName);
  
  if (!index) {
    throw new Error(`Failed to get Pinecone index: ${indexName}`);
  }

  return index;
}
