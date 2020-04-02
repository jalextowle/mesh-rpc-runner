import { DevUtilsContract } from '@0x/contracts-dev-utils';
import { artifacts, DummyERC20TokenContract } from '@0x/contracts-erc20';
import { constants, OrderFactory } from '@0x/contracts-test-utils';
import { devConstants, Web3Config, web3Factory } from '@0x/dev-utils';
import { WSClient } from '@0x/mesh-rpc-client';
import { assetDataUtils } from '@0x/order-utils';
import { Web3ProviderEngine } from '@0x/subproviders';
import { BigNumber, logUtils } from '@0x/utils';
import { Web3Wrapper } from '@0x/web3-wrapper';

const wsAddress = 'ws://localhost:60557';
const client = new WSClient(wsAddress);

(async () => {
    const providerConfigs: Web3Config = {
        total_accounts: constants.NUM_TEST_ACCOUNTS,
        shouldUseInProcessGanache: false,
        shouldAllowUnlimitedContractSize: true,
        unlocked_accounts: [
            '0x6cc5f688a315f3dc28a7781717a9a798a59fda7b',
            '0x55dc8f21d20d4c6ed3c82916a438a413ca68e335',
            '0x8ed95d1746bf1e4dab58d8ed4724f1ef95b20db0', // ERC20BridgeProxy
            '0xf977814e90da44bfa03b6295a0616a897441acec', // Binance: USDC, TUSD
        ],
    };
    const provider = web3Factory.getRpcProvider(providerConfigs);
    const web3Wrapper = new Web3Wrapper(provider);
    const accounts = await web3Wrapper.getAvailableAddressesAsync();
    const [ maker, taker, feeRecipient ] = accounts;
    const txDefaults = {
        from: devConstants.TESTRPC_FIRST_ADDRESS,
        gas: devConstants.GAS_LIMIT,
        gasPrice: constants.DEFAULT_GAS_PRICE,
    };
    const erc20Proxy = '0x1dc4c1cefef38a777b15aa20260a54e584b16c48';

    const makerToken = await DummyERC20TokenContract.deployFrom0xArtifactAsync(
        artifacts.DummyERC20Token,
        provider,
        txDefaults,
        artifacts,
        constants.DUMMY_TOKEN_NAME,
        constants.DUMMY_TOKEN_SYMBOL,
        constants.DUMMY_TOKEN_DECIMALS,
        constants.DUMMY_TOKEN_TOTAL_SUPPLY,
    );
    const takerToken = await DummyERC20TokenContract.deployFrom0xArtifactAsync(
        artifacts.DummyERC20Token,
        provider,
        txDefaults,
        artifacts,
        constants.DUMMY_TOKEN_NAME,
        constants.DUMMY_TOKEN_SYMBOL,
        constants.DUMMY_TOKEN_DECIMALS,
        constants.DUMMY_TOKEN_TOTAL_SUPPLY,
    );

    await makerToken.mint(
        constants.STATIC_ORDER_PARAMS.makerAssetAmount
    ).awaitTransactionSuccessAsync({ from: maker });
    await makerToken.approve(
        erc20Proxy,
        constants.STATIC_ORDER_PARAMS.makerAssetAmount
    ).awaitTransactionSuccessAsync({ from: maker });
    logUtils.log('maker balance', await makerToken.balanceOf(maker).callAsync());
    logUtils.log('maker allowance', await makerToken.allowance(maker, erc20Proxy).callAsync());

    const factory = new OrderFactory(new Buffer(constants.TESTRPC_PRIVATE_KEYS[accounts.indexOf(maker)]), {
        ...constants.STATIC_ORDER_PARAMS,
        takerAssetAmount: constants.STATIC_ORDER_PARAMS.makerAssetAmount,
        makerAddress: maker,
        takerAddress: taker,
        feeRecipientAddress: feeRecipient,
        makerAssetData: assetDataUtils.encodeERC20AssetData(makerToken.address),
        takerAssetData: assetDataUtils.encodeERC20AssetData(takerToken.address),
        makerFeeAssetData: assetDataUtils.encodeERC20AssetData(makerToken.address),
        takerFeeAssetData: assetDataUtils.encodeERC20AssetData(takerToken.address),
        makerFee: constants.ZERO_AMOUNT,
        takerFee: constants.ZERO_AMOUNT,
        exchangeAddress: '0x48bacb9266a570d521063ef5dd96e61686dbe788',
        chainId: 1337,
    });

    const order = await factory.newSignedOrderAsync({});

    const devUtilsAddress = '0xb23672f74749bf7916ba6827c64111a4d6de7f11';
    const devUtils = new DevUtilsContract(devUtilsAddress, provider);
    logUtils.log(await devUtils.getOrderRelevantState(order, order.signature).callAsync());

    const validationResults = await client.addOrdersAsync([ order ]);
    for (const accepted of validationResults.accepted) {
        logUtils.log('accepted', accepted);
    }
    for (const rejected of validationResults.rejected) {
        logUtils.log('rejected', rejected);
    }
    process.exit(0);
})().catch(err => {
    logUtils.warn(err);
    process.exit(1);
});
