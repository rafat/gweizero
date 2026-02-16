// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title GasOptimizerAdvanced
 * @dev A complex contract with multiple gas optimization opportunities
 *      Designed to test AI-powered gas optimization pipeline
 */
contract GasOptimizerAdvanced {
    // Storage layout with packing opportunities
    struct Account {
        uint256 balance;
        uint64 createdAt;
        bool isActive;
        uint8 tier;
        address referrer;
        uint128 stakedAmount;
        bool hasClaimed;
        uint32 lastClaimTime;
    }

    struct RewardPool {
        uint256 totalRewards;
        uint256 claimedRewards;
        uint64 startTime;
        uint64 endTime;
        bool isActive;
    }

    // State variables (packing opportunities)
    address public owner;
    address public stakingToken;
    uint8 public version = 2;
    bool public paused;
    uint8 public minTier = 1;
    bool public rewardsEnabled;
    
    // Mappings
    mapping(address => Account) public accounts;
    mapping(address => uint256[]) public userTransactions;
    mapping(uint256 => RewardPool) public rewardPools;
    mapping(address => mapping(address => bool)) public approvals;
    
    // Arrays
    address[] public allUsers;
    uint256[] public transactionHistory;
    
    // Counters
    uint256 public totalUsers;
    uint256 public totalTransactions;
    uint256 public platformFees;

    // Events
    event AccountCreated(address indexed user, uint64 timestamp);
    event StakeDeposited(address indexed user, uint256 amount);
    event StakeWithdrawn(address indexed user, uint256 amount);
    event RewardClaimed(address indexed user, uint256 amount);
    event TierUpgraded(address indexed user, uint8 newTier);
    event Transfer(address indexed from, address indexed to, uint256 amount);

    // Errors (for optimization - should replace require strings)
    error NotAuthorized();
    error ContractPaused();
    error InvalidAmount();
    error InsufficientBalance();
    error UserNotFound();
    error LengthMismatch();

    constructor(address _stakingToken) {
        owner = msg.sender;
        stakingToken = _stakingToken;
        paused = false;
        rewardsEnabled = true;
    }

    /**
     * @dev Create a new account - has optimization opportunities
     */
    function createAccount(address referrerAddress) external {
        require(msg.sender == owner || !paused, "Contract paused");
        require(accounts[msg.sender].createdAt == 0, "Account exists");

        accounts[msg.sender] = Account({
            balance: 0,
            createdAt: uint64(block.timestamp),
            isActive: true,
            tier: 1,
            referrer: referrerAddress,
            stakedAmount: 0,
            hasClaimed: false,
            lastClaimTime: 0
        });

        allUsers.push(msg.sender);
        totalUsers++;

        if (referrerAddress != address(0)) {
            accounts[referrerAddress].tier = accounts[referrerAddress].tier + 1;
        }

        emit AccountCreated(msg.sender, uint64(block.timestamp));
    }

    /**
     * @dev Batch deposit stakes - multiple optimization opportunities
     */
    function batchStake(uint256[] memory amounts) external {
        require(!paused, "Contract paused");
        require(accounts[msg.sender].isActive, "Account inactive");
        require(amounts.length > 0, "Empty amounts");

        for (uint256 i = 0; i < amounts.length; i++) {
            require(amounts[i] > 0, "Invalid amount");
            
            accounts[msg.sender].balance += amounts[i];
            accounts[msg.sender].stakedAmount += uint128(amounts[i]);
            
            userTransactions[msg.sender].push(totalTransactions);
            transactionHistory.push(amounts[i]);
            totalTransactions++;
        }

        emit StakeDeposited(msg.sender, _sumArray(amounts));
    }

    /**
     * @dev Batch withdraw - storage read optimization opportunities
     */
    function batchWithdraw(uint256[] memory amounts) external {
        require(!paused, "Contract paused");
        Account storage account = accounts[msg.sender];
        require(account.isActive, "Account inactive");

        uint256 totalWithdrawal = 0;

        for (uint256 i = 0; i < amounts.length; i++) {
            require(amounts[i] > 0, "Invalid amount");
            require(account.balance >= amounts[i], "Insufficient balance");
            
            account.balance -= amounts[i];
            account.stakedAmount -= uint128(amounts[i]);
            totalWithdrawal += amounts[i];
        }

        require(account.balance >= 0, "Balance underflow");

        emit StakeWithdrawn(msg.sender, totalWithdrawal);
    }

    /**
     * @dev Claim rewards - has unchecked math opportunities
     */
    function claimRewards(uint256[] calldata poolIds) external {
        require(rewardsEnabled, "Rewards disabled");
        require(!paused, "Contract paused");
        Account storage account = accounts[msg.sender];
        require(account.isActive, "Account inactive");

        uint256 totalClaimed = 0;

        for (uint256 i = 0; i < poolIds.length; i++) {
            RewardPool storage pool = rewardPools[poolIds[i]];
            require(pool.isActive, "Pool inactive");
            require(block.timestamp >= pool.startTime, "Not started");
            require(block.timestamp <= pool.endTime, "Pool ended");
            require(!account.hasClaimed, "Already claimed");

            uint256 reward = _calculateReward(account, pool);
            require(reward > 0, "No reward");

            pool.claimedRewards += reward;
            account.balance += reward;
            totalClaimed += reward;
            account.hasClaimed = true;
            account.lastClaimTime = uint32(block.timestamp);
        }

        emit RewardClaimed(msg.sender, totalClaimed);
    }

    /**
     * @dev Upgrade tier - state variable optimization
     */
    function upgradeTier(address[] memory users, uint8[] memory newTiers) external {
        require(msg.sender == owner, "Not authorized");
        require(users.length == newTiers.length, "Length mismatch");

        for (uint256 i = 0; i < users.length; i++) {
            Account storage account = accounts[users[i]];
            require(account.createdAt != 0, "User not found");
            require(newTiers[i] > account.tier, "Invalid tier");

            account.tier = newTiers[i];
            emit TierUpgraded(users[i], newTiers[i]);
        }
    }

    /**
     * @dev Batch transfer - multiple optimization opportunities
     */
    function batchTransfer(address[] memory recipients, uint256[] memory amounts) external {
        require(!paused, "Contract paused");
        require(recipients.length == amounts.length, "Length mismatch");
        
        Account storage senderAccount = accounts[msg.sender];
        require(senderAccount.isActive, "Account inactive");

        for (uint256 i = 0; i < recipients.length; i++) {
            require(recipients[i] != address(0), "Invalid recipient");
            require(amounts[i] > 0, "Invalid amount");
            require(senderAccount.balance >= amounts[i], "Insufficient balance");

            senderAccount.balance -= amounts[i];
            accounts[recipients[i]].balance += amounts[i];
            
            approvals[msg.sender][recipients[i]] = true;
            
            emit Transfer(msg.sender, recipients[i], amounts[i]);
        }
    }

    /**
     * @dev Set approvals for batch operations
     */
    function setApprovals(address[] memory operators, bool[] memory approved) external {
        require(operators.length == approved.length, "Length mismatch");

        for (uint256 i = 0; i < operators.length; i++) {
            approvals[msg.sender][operators[i]] = approved[i];
        }
    }

    /**
     * @dev Get user transaction count - view function optimization
     */
    function getUserTransactionCount(address user) external view returns (uint256) {
        return userTransactions[user].length;
    }

    /**
     * @dev Get all user addresses - has cache length opportunity
     */
    function getAllUsers() external view returns (address[] memory) {
        address[] memory result = new address[](allUsers.length);
        
        for (uint256 i = 0; i < allUsers.length; i++) {
            result[i] = allUsers[i];
        }
        
        return result;
    }

    /**
     * @dev Calculate total platform fees - view function
     */
    function getPlatformStats() external view returns (
        uint256 totalUsersCount,
        uint256 totalTxCount,
        uint256 totalFees,
        uint256 activePools
    ) {
        totalUsersCount = totalUsers;
        totalTxCount = totalTransactions;
        totalFees = platformFees;
        
        uint256 activeCount = 0;
        for (uint256 i = 0; i < 100; i++) {
            if (rewardPools[i].isActive) {
                activeCount++;
            }
        }
        activePools = activeCount;
    }

    /**
     * @dev Create reward pool - admin function
     */
    function createRewardPool(
        uint256 poolId,
        uint256 totalRewards,
        uint64 startTime,
        uint64 endTime
    ) external {
        require(msg.sender == owner, "Not authorized");
        require(endTime > startTime, "Invalid time range");

        rewardPools[poolId] = RewardPool({
            totalRewards: totalRewards,
            claimedRewards: 0,
            startTime: startTime,
            endTime: endTime,
            isActive: true
        });
    }

    /**
     * @dev Pause/unpause contract
     */
    function setPaused(bool _paused) external {
        require(msg.sender == owner, "Not authorized");
        paused = _paused;
    }

    /**
     * @dev Enable/disable rewards
     */
    function setRewardsEnabled(bool enabled) external {
        require(msg.sender == owner, "Not authorized");
        rewardsEnabled = enabled;
    }

    /**
     * @dev Internal: Calculate reward for a user
     */
    function _calculateReward(Account storage account, RewardPool storage pool) 
        internal 
        view 
        returns (uint256) 
    {
        if (account.stakedAmount == 0) return 0;
        
        uint256 share = (account.stakedAmount * 1e18) / pool.totalRewards;
        uint256 timeMultiplier = 1e18;
        
        if (account.tier >= 2) timeMultiplier += 10e16;
        if (account.tier >= 3) timeMultiplier += 10e16;
        if (account.tier >= 4) timeMultiplier += 20e16;
        
        return (pool.totalRewards * share * timeMultiplier) / 1e36;
    }

    /**
     * @dev Internal: Sum array elements
     */
    function _sumArray(uint256[] memory arr) internal pure returns (uint256) {
        uint256 sum = 0;
        for (uint256 i = 0; i < arr.length; i++) {
            sum += arr[i];
        }
        return sum;
    }

    /**
     * @dev Internal: Check if address is valid
     */
    function _isValidAddress(address addr) internal pure returns (bool) {
        return addr != address(0);
    }
}
