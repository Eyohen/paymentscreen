// Test URL generation for Coinley Payment QR codes

const BASE_URL = 'https://paymentscreen.vercel.app/';

// Sample payment data
const samplePayment = {
    merchant: 'Coffee Shop Demo',
    amount: '99.99',
    productAmount: '95.00',
    platformFee: '2.99',
    networkFee: '2.00',
    token: 'USDC',
    network: 'Ethereum Mainnet',
    merchantAddress: '0x742d35cc6495c0a7c8b8e8dd90ec1dd4b1f0e3a8'
};

// Generate the URL with parameters
function generatePaymentURL(paymentData) {
    const params = new URLSearchParams(paymentData);
    return BASE_URL + '?' + params.toString();
}

// Test the URL generation
const paymentURL = generatePaymentURL(samplePayment);

console.log('🔗 Generated Payment URL:');
console.log(paymentURL);
console.log('\n📋 URL Length:', paymentURL.length);
console.log('✅ This URL will be encoded in the QR code');

// Show URL breakdown
console.log('\n📊 Parameters breakdown:');
const urlObj = new URL(paymentURL);
urlObj.searchParams.forEach((value, key) => {
    console.log(`  ${key}: ${value}`);
});

// Test different payment scenarios
console.log('\n🧪 Testing different scenarios:');

const scenarios = [
    {
        name: 'Small Purchase',
        data: { ...samplePayment, merchant: 'Local Store', amount: '25.99', productAmount: '24.00', platformFee: '1.00', networkFee: '0.99' }
    },
    {
        name: 'Large Purchase',
        data: { ...samplePayment, merchant: 'Electronics Store', amount: '1299.99', productAmount: '1250.00', platformFee: '35.99', networkFee: '14.00' }
    },
    {
        name: 'Different Token',
        data: { ...samplePayment, token: 'USDT', network: 'Polygon' }
    }
];

scenarios.forEach(scenario => {
    const url = generatePaymentURL(scenario.data);
    console.log(`\n${scenario.name}:`);
    console.log(`Length: ${url.length} chars`);
    console.log(`URL: ${url}`);
});

// Export for use in QR generator
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { generatePaymentURL, samplePayment };
}