// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title Flattened Staking Token Contract
 * @dev This is a FLATTENED contract for testing GweiZero optimization
 *      Original imports: @openzeppelin/contracts/token/ERC20/ERC20.sol
 *                        @openzeppelin/contracts/access/Ownable.sol
 *                        @openzeppelin/contracts/security/Pausable.sol
 * 
 * Optimization opportunities:
 * - memory → calldata for external functions
 * - Cache array lengths in loops
 * - Use storage pointers
 * - Unchecked math for counters
 * - Storage packing in structs
 */

// ============ LIBRARY: Context ============
abstract contract Context {
    function _msgSender() internal view virtual returns (address) {
        return msg.sender;
    }

    function _msgData() internal view virtual returns (bytes calldata) {
        return msg.data;
    }
}

// ============ LIBRARY: Ownable ============
abstract contract Ownable is Context {
    address private _owner;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    constructor() {
        _transferOwnership(_msgSender());
    }

    modifier onlyOwner() {
        _checkOwner();
        _;
    }

    function owner() public view virtual returns (address) {
        return _owner;
    }

    function _checkOwner() internal view virtual {
        require(owner() == _msgSender(), "Ownable: caller is not the owner");
    }

    function transferOwnership(address newOwner) public virtual onlyOwner {
        require(newOwner != address(0), "Ownable: new owner is the zero address");
        _transferOwnership(newOwner);
    }

    function _transferOwnership(address newOwner) internal virtual {
        address oldOwner = _owner;
        _owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
}

// ============ LIBRARY: Pausable ============
abstract contract Pausable is Context {
    bool private _paused;

    event Paused(address account);
    event Unpaused(address account);

    constructor() {
        _paused = false;
    }

    function paused() public view virtual returns (bool) {
        return _paused;
    }

    modifier whenNotPaused() {
        _requireNotPaused();
        _;
    }

    modifier whenPaused() {
        _requirePaused();
        _;
    }

    function _requireNotPaused() internal view virtual {
        require(!paused(), "Pausable: paused");
    }

    function _requirePaused() internal view virtual {
        require(paused(), "Pausable: not paused");
    }

    function _pause() internal virtual whenNotPaused {
        _paused = true;
        emit Paused(_msgSender());
    }

    function _unpause() internal virtual whenPaused {
        _paused = false;
        emit Unpaused(_msgSender());
    }
}

// ============ LIBRARY: IERC20 ============
interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

// ============ LIBRARY: IERC20Metadata ============
interface IERC20Metadata is IERC20 {
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function decimals() external view returns (uint8);
}

// ============ LIBRARY: ERC20 ============
contract ERC20 is Context, IERC20, IERC20Metadata {
    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;
    uint256 private _totalSupply;
    string private _name;
    string private _symbol;

    constructor(string memory name_, string memory symbol_) {
        _name = name_;
        _symbol = symbol_;
    }

    function name() public view virtual override returns (string memory) {
        return _name;
    }

    function symbol() public view virtual override returns (string memory) {
        return _symbol;
    }

    function decimals() public view virtual override returns (uint8) {
        return 18;
    }

    function totalSupply() public view virtual override returns (uint256) {
        return _totalSupply;
    }

    function balanceOf(address account) public view virtual override returns (uint256) {
        return _balances[account];
    }

    function transfer(address to, uint256 amount) public virtual override returns (bool) {
        address owner = _msgSender();
        _transfer(owner, to, amount);
        return true;
    }

    function allowance(address owner, address spender) public view virtual override returns (uint256) {
        return _allowances[owner][spender];
    }

    function approve(address spender, uint256 amount) public virtual override returns (bool) {
        address owner = _msgSender();
        _approve(owner, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) public virtual override returns (bool) {
        address spender = _msgSender();
        _spendAllowance(from, spender, amount);
        _transfer(from, to, amount);
        return true;
    }

    function increaseAllowance(address spender, uint256 addedValue) public virtual returns (bool) {
        address owner = _msgSender();
        _approve(owner, spender, allowance(owner, spender) + addedValue);
        return true;
    }

    function decreaseAllowance(address spender, uint256 subtractedValue) public virtual returns (bool) {
        address owner = _msgSender();
        uint256 currentAllowance = allowance(owner, spender);
        require(currentAllowance >= subtractedValue, "ERC20: decreased allowance below zero");
        unchecked {
            _approve(owner, spender, currentAllowance - subtractedValue);
        }
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal virtual {
        require(from != address(0), "ERC20: transfer from the zero address");
        require(to != address(0), "ERC20: transfer to the zero address");

        uint256 fromBalance = _balances[from];
        require(fromBalance >= amount, "ERC20: transfer amount exceeds balance");
        unchecked {
            _balances[from] = fromBalance - amount;
            _balances[to] += amount;
        }
    }

    function _mint(address account, uint256 amount) internal virtual {
        require(account != address(0), "ERC20: mint to the zero address");
        _totalSupply += amount;
        unchecked {
            _balances[account] += amount;
        }
    }

    function _approve(address owner, address spender, uint256 amount) internal virtual {
        require(owner != address(0), "ERC20: approve from the zero address");
        require(spender != address(0), "ERC20: approve to the zero address");
        _allowances[owner][spender] = amount;
    }

    function _spendAllowance(address owner, address spender, uint256 amount) internal virtual {
        uint256 currentAllowance = allowance(owner, spender);
        if (currentAllowance != type(uint256).max) {
            require(currentAllowance >= amount, "ERC20: insufficient allowance");
            unchecked {
                _approve(owner, spender, currentAllowance - amount);
            }
        }
    }
}

// ============ CONTRACT: StakingToken (MAIN CONTRACT TO OPTIMIZE) ============
contract StakingToken is ERC20, Ownable, Pausable {
    // Staking data structure (optimization: reorder for packing)
    struct StakeInfo {
        uint256 amount;
        uint64 stakedAt;
        uint32 lockPeriod;
        bool isActive;
    }

    // State variables
    mapping(address => StakeInfo) public stakes;
    mapping(address => uint256) public rewards;
    mapping(address => uint256[]) public stakeHistory;
    address[] public allStakers;
    uint256 public rewardRate;
    uint256 public totalStaked;
    bool public rewardsEnabled;

    event Staked(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 amount);
    event RewardClaimed(address indexed user, uint256 amount);

    constructor() ERC20("StakingToken", "STK") {
        rewardRate = 10; // 10% APY
        rewardsEnabled = true;
    }

    // OPTIMIZATION OPPORTUNITY: memory → calldata
    function stake(uint256 amount, uint32 lockDays) external whenNotPaused {
        require(amount > 0, "Amount must be > 0");
        require(_balances[msg.sender] >= amount, "Insufficient balance");

        stakes[msg.sender] = StakeInfo({
            amount: amount,
            stakedAt: uint64(block.timestamp),
            lockPeriod: lockDays,
            isActive: true
        });

        stakeHistory[msg.sender].push(totalStaked);
        allStakers.push(msg.sender);
        totalStaked += amount;

        _transfer(msg.sender, address(this), amount);

        emit Staked(msg.sender, amount);
    }

    // OPTIMIZATION OPPORTUNITY: batch operations with loops
    function batchStake(address[] memory users, uint256[] memory amounts) external onlyOwner {
        require(users.length == amounts.length, "Length mismatch");

        for (uint256 i = 0; i < users.length; i++) {
            require(amounts[i] > 0, "Invalid amount");
            require(_balances[users[i]] >= amounts[i], "Insufficient balance");

            stakes[users[i]].amount = amounts[i];
            stakes[users[i]].stakedAt = uint64(block.timestamp);
            stakes[users[i]].isActive = true;

            _transfer(users[i], address(this), amounts[i]);
            totalStaked += amounts[i];

            emit Staked(users[i], amounts[i]);
        }
    }

    function unstake() external whenNotPaused {
        StakeInfo storage stake = stakes[msg.sender];
        require(stake.isActive, "No active stake");
        require(block.timestamp >= stake.stakedAt + stake.lockPeriod, "Still locked");

        uint256 amount = stake.amount;
        stake.isActive = false;
        totalStaked -= amount;

        _transfer(address(this), msg.sender, amount);

        emit Unstaked(msg.sender, amount);
    }

    // OPTIMIZATION OPPORTUNITY: cache storage reads
    function claimRewards() external {
        require(rewardsEnabled, "Rewards disabled");
        require(stakes[msg.sender].isActive, "No active stake");

        uint256 reward = calculateReward(msg.sender);
        require(reward > 0, "No reward available");

        rewards[msg.sender] = 0;
        _mint(msg.sender, reward);

        emit RewardClaimed(msg.sender, reward);
    }

    // OPTIMIZATION OPPORTUNITY: batch claim with loop
    function batchClaimRewards(address[] memory users) external onlyOwner {
        require(rewardsEnabled, "Rewards disabled");

        for (uint256 i = 0; i < users.length; i++) {
            require(stakes[users[i]].isActive, "No active stake");

            uint256 reward = calculateReward(users[i]);
            if (reward > 0) {
                rewards[users[i]] = 0;
                _mint(users[i], reward);
                emit RewardClaimed(users[i], reward);
            }
        }
    }

    // OPTIMIZATION OPPORTUNITY: storage packing, cache length
    function calculateReward(address user) public view returns (uint256) {
        StakeInfo storage stake = stakes[user];
        if (!stake.isActive) return 0;

        uint256 stakingDuration = block.timestamp - stake.stakedAt;
        uint256 baseReward = (stake.amount * rewardRate * stakingDuration) / (365 days * 100);

        // Tier bonus based on stake size
        if (stake.amount >= 10000 * 1e18) {
            baseReward = (baseReward * 150) / 100; // 50% bonus
        } else if (stake.amount >= 1000 * 1e18) {
            baseReward = (baseReward * 120) / 100; // 20% bonus
        }

        return baseReward - rewards[user];
    }

    // OPTIMIZATION OPPORTUNITY: cache array length in view function
    function getAllStakers() external view returns (address[] memory) {
        address[] memory result = new address[](allStakers.length);

        for (uint256 i = 0; i < allStakers.length; i++) {
            result[i] = allStakers[i];
        }

        return result;
    }

    // OPTIMIZATION OPPORTUNITY: redundant check removal
    function getUserStakeHistory(address user) external view returns (uint256[] memory) {
        uint256[] memory history = stakeHistory[user];
        require(history.length >= 0, "Invalid history"); // REDUNDANT: uint256 can't be < 0

        return history;
    }

    // Admin functions
    function setRewardRate(uint256 newRate) external onlyOwner {
        rewardRate = newRate;
    }

    function setRewardsEnabled(bool enabled) external onlyOwner {
        rewardsEnabled = enabled;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // Emergency functions
    function emergencyWithdraw() external whenPaused {
        StakeInfo storage stake = stakes[msg.sender];
        require(stake.isActive, "No active stake");

        uint256 amount = stake.amount;
        stake.isActive = false;
        stake.amount = 0;
        totalStaked -= amount;

        _transfer(address(this), msg.sender, amount);

        emit Unstaked(msg.sender, amount);
    }
}
