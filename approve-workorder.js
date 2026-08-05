const fetch = global.fetch || require('node-fetch');

const [,, url, workOrderId, cookie] = process.argv;

if (!url || !workOrderId) {
  console.error('Usage: node approve-workorder.js <url> <workOrderId> [cookie]');
  process.exit(1);
}

(async () => {
  try {
    const response = await fetch(`${url}/api/workorders/${workOrderId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
      },
    });

    const json = await response.json();
    if (!response.ok) {
      console.error('Approve work order failed:', json);
      process.exit(1);
    }

    console.log('Work order approved:', json);
  } catch (error) {
    console.error('Error approving work order:', error);
    process.exit(1);
  }
})();
